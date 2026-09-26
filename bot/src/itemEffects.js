// ── 아이템 효과 캐시 (아이템 등록 · 구매 변경을 1분 주기로 반영) ──
// ═══════════════════════════════════════════════════════
// 📌 아이템 효과 — 사이트 lib/itemEffects.js(효과 모양 · 정리 · 조건 판정)와
//    lib/ownedItems.js(보유 아이템 판정) 규칙을 손으로 옮긴 사본.
//    ⚠️ 봇은 별도 배포라 사이트 파일을 import 하지 못한다.
//       상황(on) 값 · 의미 · 한도 · 시간 판정 · 보유 판정을 바꾸면 사이트 두 파일과 반드시 같이 고칠 것.
//    효과는 디스코드 역할이 아니라 "인벤토리에 들고 있는 아이템"에서 나온다 — 사이트 models/Item 의 chatBuffXp · voiceBuffXp · attendBuffXp · effects.
//    (역할 버프 RoleConfig.buffXp · attendBuffXp 는 roleConfigs.js 가 따로, 역할 기준으로 그대로 더한다)
//
//    효과 하나: { id, on, mode: "add" | "percent", amount, minMinutes?, everyN?, days?, hourFrom?, hourTo?, channelIds? }
//      · days      : KST 요일(0=일 … 6=토). 비면 매일
//      · hourFrom/hourTo : KST 시각. from <= 지금 < to, from > to 면 자정을 넘는 구간(22~2)
//      · channelIds : 채팅 · 음성에서만 — 그 채널(또는 그 카테고리 안)에서만
//      · percent   : 그 1회 지급의 기본 XP(다른 효과 · 버프를 더하기 전 값)의 N%
//    기본 효과 세 칸은 같은 목록에 합쳐 둔다 —
//      chatBuffXp → "채팅 1회당 +N"(basic-chat), voiceBuffXp → "음성 1회당 +N"(basic-voice), attendBuffXp → "출석 시 +N"(basic-attend)
//
//    📌 보유 판정 (사이트 lib/ownedItems.js · app/api/shop/my-items (A)/(B) 와 같은 규칙)
//      (A) 구매 건 — status pending(결제 끝, 지급 대기) · completed 이고 기간이 안 지난 것
//          아이템 = Item(itemRef) > Item(상품.itemId) > (상품도 아이템도 못 찾고 roleId 가 있으면) 그 역할의 첫 아이템(숨김 포함)
//          디스코드 역할 유무는 보지 않는다 — siteOnly · 지급 대기 · 역할이 빠진 완료 건도 보유다.
//          roleId 가 있는 역할형(role · perk · item) 건은 아이템을 찾았든 못 찾았든 그 역할을 "구매로 본 역할"에 넣는다.
//      (B) 디스코드에 실제로 있는 역할 중 (A)에서 보지 못한 것 → 그 역할의 첫 "보이는" 아이템
//      아이템은 효과 유무와 상관없이 전체(sortOrder · createdAt 순)에서 고른다 — 효과 있는 뒤쪽 아이템으로 건너뛰지 않는다.
//      같은 아이템은 한 번만 — 두 번 사도 효과는 한 번.
// ═══════════════════════════════════════════════════════
import { Item, ShopItem, Purchase, UserXp } from "./db.js";
import { kstToday } from "./leveling.js";

const REFRESH_MS = 60 * 1000;
const ROLE_LIKE = new Set(["role", "perk", "item"]);

const EFFECT_TRIGGERS = {
  chat: { modes: ["add", "percent"], channels: true },          // 채팅 1회당
  voice: { modes: ["add", "percent"], channels: true },         // 음성 1회당
  voiceDaily: { modes: ["add"], needs: "minMinutes", once: true }, // 하루 음성 N분 채우면 (하루 1번)
  firstChat: { modes: ["add"], once: true },                    // 하루 첫 채팅 (하루 1번)
  attend: { modes: ["add"] },                                   // 출석 시
  attendEvery: { modes: ["add"], needs: "everyN" },             // 출석 N번째마다 (누적 출석 수 기준)
  levelUp: { modes: ["add"] },                                  // 레벨이 오를 때마다
};
const MAX_EFFECTS = 20;
const LIMIT = { add: 1_000_000, percent: 500, minutes: 1440, everyN: 365 };

const toInt = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
};

// 사이트 normalizeEffects 와 같은 정리 — 모르는 상황 · 빈 값은 버린다.
//    단 id 가 비면 무작위 대신 자리 번호로 채운다(1분마다 다시 읽어도 "하루 1번" 키가 바뀌지 않게).
function cleanEffects(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.slice(0, MAX_EFFECTS).forEach((raw, i) => {
    const t = EFFECT_TRIGGERS[raw?.on];
    if (!t) return;
    const mode = t.modes.includes(raw?.mode) ? raw.mode : t.modes[0];
    const amount = toInt(raw?.amount, 0, mode === "percent" ? LIMIT.percent : LIMIT.add);
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
    const days = Array.isArray(raw?.days) ? [...new Set(raw.days.map((d) => toInt(d, 0, 6)).filter((d) => d != null))] : [];
    if (days.length && days.length < 7) e.days = days;
    const hf = raw?.hourFrom === "" || raw?.hourFrom == null ? null : toInt(raw.hourFrom, 0, 23);
    const ht = raw?.hourTo === "" || raw?.hourTo == null ? null : toInt(raw.hourTo, 0, 24);
    if (hf != null && ht != null && hf !== ht) { e.hourFrom = hf; e.hourTo = ht; }
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
//    byUser            : 유저 id → 구매 건 [{ itemId, roleId, exp }] — (A) 를 미리 풀어 둔 것. 만료(exp)는 쓸 때 다시 본다
let state = { effectsById: new Map(), visibleItemByRole: new Map(), byUser: new Map() };

export async function refreshItemEffects() {
  try {
    const [items, shopItems, purchases] = await Promise.all([
      Item.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean(),
      ShopItem.find({}, { itemId: 1 }).lean(),
      Purchase.find(
        {
          status: { $in: ["pending", "completed"] },
          itemType: { $ne: "physical" },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        },
        { userId: 1, itemRef: 1, itemId: 1, roleId: 1, itemType: 1, expiresAt: 1 }
      ).lean(),
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
      const hasShop = shopRef.has(String(p.itemId));
      const ref = p.itemRef ? String(p.itemRef) : "";
      const viaShop = shopRef.get(String(p.itemId)) || "";
      let itemId = (ref && itemIds.has(ref) && ref) || (viaShop && itemIds.has(viaShop) && viaShop) || "";
      // 상품 스냅샷도 없는 옛 건(시즌 패스 역할 보상 등) — 같은 역할의 첫 아이템
      if (!itemId && !hasShop && p.roleId) itemId = itemByRole.get(p.roleId) || "";
      // 역할형 건은 아이템을 찾았든 못 찾았든 그 역할을 "구매로 본 역할"로 — (B) 에서 다시 세지 않게
      const roleId = p.roleId && ROLE_LIKE.has(p.itemType) ? String(p.roleId) : "";
      if (!itemId && !roleId) continue;
      const exp = p.expiresAt ? new Date(p.expiresAt).getTime() : 0;
      const row = { itemId, roleId, exp };
      const list = byUser.get(p.userId);
      if (list) list.push(row);
      else byUser.set(p.userId, [row]);
    }

    state = { effectsById, visibleItemByRole, byUser };
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
    if (p.itemId) owned.add(p.itemId);
    if (p.roleId) seenRoles.add(p.roleId);
  }
  // (B) 구매로 보지 못한 실보유 역할 → 그 역할의 첫 보이는 아이템
  const roles = member?.roles?.cache;
  if (roles) {
    for (const [roleId, itemId] of state.visibleItemByRole) {
      if (!seenRoles.has(roleId) && roles.has(roleId)) owned.add(itemId);
    }
  }
  return owned;
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
//    오류가 나도 0 을 돌려준다 — 효과 때문에 기존 지급이 막히면 안 된다.
export function effectXp(member, on, { base = 0, channel = null, kst = kstNow() } = {}) {
  try {
    let add = 0;
    let pct = 0;
    for (const e of heldEffects(member, on)) {
      if (!effectTimeOk(e, kst) || !effectChannelOk(e, channel)) continue;
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
