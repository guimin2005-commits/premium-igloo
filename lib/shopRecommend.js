// 📌 ARCTIC 홈 추천 — '지금 잘 나가는' · '○○에게 맞는' · '이번 주' 를 고르는 순수 계산.
//    DB · 서버 의존이 없다 — 입력(구매 목록 · 유저 레벨 표 · 상품 목록 · 나)을 받아 결과 id 만 낸다.
//    API(app/api/shop/recommend)가 DB 를 읽어 넣고, 전체 집계(buildStats)는 5분 캐시, 개인 부분(recommend)은 요청마다.
//    ⚠️ 구매 기록은 개인 데이터다 — 결과에는 상품 id 와 짧은 제목만 담는다(누가 무엇을 샀는지는 밖으로 나가지 않는다).
//    Node 로 바로 돌려 볼 수 있게 상대 경로(.js)로 부른다.
import { cardPick, discountActive, discountPctOf, durationOptions, salePrice, isTimed, isPointOnly, affordFor } from "./shopPricing.js";
import { getTierIndex, VOICE_TIERS } from "./voiceTiers.js";
import { getLevelByXp } from "./leveling.js";
import { pointToXp } from "./pointRate.js";
import { isUnitSale } from "./unitSale.js";

const DAY = 86400000;

export const HOT_DAYS = 14;          // 요즘 인기 — 최근 14일
export const HALF_LIFE_DAYS = 3.5;   // 3.5일 지나면 무게가 절반
export const HOT_MIN_SCORE = 3;      // 요즘 인기 점수 합이 이보다 작으면 누적 인기(180일 구매자 수)를 섞는다(데이터가 적을 때)
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
  const hotBy = new Map();   // itemId → Map(userId → 가장 최근 구매의 무게)
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
    list.push({ p, at, age });
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

  for (const { p, age } of list) {
    const id = String(p.itemId);
    const u = String(p.userId);
    addTo(owners, id, u);
    addTo(baskets, u, id);
    if (age <= TIER_DAYS) {
      addTo(all30, id, u);
      const t = tierAt.get(p);
      if (!tier.has(t)) tier.set(t, new Map());
      addTo(tier.get(t), id, u);
    }
    if (age <= HOT_DAYS) {
      // 같은 사람이 여러 번 사도 한 번 — 가장 최근 구매의 무게만 남긴다(서로 다른 구매자 수 중심)
      const w = Math.pow(0.5, age / HALF_LIFE_DAYS);
      let m = hotBy.get(id);
      if (!m) hotBy.set(id, (m = new Map()));
      if (!(m.get(u) >= w)) m.set(u, w);
    }
  }

  const hot = new Map();
  let hotSum = 0;
  for (const [id, m] of hotBy) {
    let s = 0;
    for (const w of m.values()) s += w;
    hot.set(id, s);
    hotSum += s;
  }
  return { at: nowMs, hot, hotSum, tier, all30, owners, baskets };
}

// 상품 하나에 해당하는 내 살아 있는 보유 건 — app/arctic/owned.ts liveOf 와 같은 기준(같은 상품이거나 연결된 아이템을 itemRef 로 받은 것)
const liveOf = (mine, it, nowMs) =>
  mine.filter((p) => OWN_STATUS.has(p.status) && (!p.expiresAt || ms(p.expiresAt) > nowMs)
    && (String(p.itemId) === String(it._id) || (!!it.itemId && p.itemRef === it.itemId)));

// 가장 싼 판매가 — 예산 안에 드는 게 없을 때 "가장 가까운 것" 을 고르는 기준
const cheapest = (it) => {
  const opts = durationOptions(it);
  return opts.length ? Math.min(...opts.map((o) => salePrice(it, o.days))) : salePrice(it);
};

// 📌 다양성 — 이미 고른 것과 유형(type)이 다른 것을 먼저. 없으면 점수 순서대로
function takeDiverse(list, n, taken) {
  const out = [];
  const left = [...list];
  while (out.length < n && left.length) {
    const types = new Set([...taken, ...out].map((x) => x.it.type));
    let i = left.findIndex((x) => !types.has(x.it.type));
    if (i < 0) i = 0;
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

// ── 개인 추천 (요청마다) ──
//    items: 상품 목록(판매 중인 것만 쓴다)
//    me   : null(비로그인) | { userId, level, xp, point, purchases: [{ itemId, itemRef, status, expiresAt, days, createdAt }] }
//    반환 : { hot: [id], forMe: { title, ids, basis }, deal: { id, kind } | null, renewSoon: [{ id, expiresAt }] }
//           basis — "tier"(등급 인기) · "co"(함께 산) · "popular"(비로그인 인기) · "fit"(근거 없음) · "timed"(기간제 채움)
export function recommend({ stats, items, me = null, now = Date.now() } = {}) {
  const nowMs = Number(now);
  const st = stats || buildStats({ purchases: [], levels: {}, now: nowMs });
  const active = (Array.isArray(items) ? items : []).filter((it) => it && it._id && it.active !== false);
  const sid = (it) => String(it._id);
  const hotOf = (it) => st.hot.get(sid(it)) || 0;

  // ── 1) 지금 잘 나가는 — 14일 · 반감기 3.5일 · 서로 다른 구매자. 점수 합이 모자라면 누적 인기를 그만큼 섞는다 ──
  //    📌 누적 인기는 180일 동안 산 서로 다른 사람 수 — 판매 수(soldCount)는 한 사람의 연장 · 재구매도 매번 늘어
  //       기간제를 자주 연장하는 몇 명이 부풀린다. 180일 기록이 아예 없을 때만 판매 수를 쓴다
  const ownersOf = (it) => st.owners.get(sid(it))?.size || 0;
  const maxOwners = Math.max(0, ...active.map(ownersOf));
  const maxSold = Math.max(0, ...active.map((it) => Number(it.soldCount) || 0));
  const fillOf = (it) => (maxOwners > 0 ? ownersOf(it) / maxOwners : maxSold > 0 ? (Number(it.soldCount) || 0) / maxSold : 0);
  const lam = Math.max(0, HOT_MIN_SCORE - st.hotSum) / HOT_MIN_SCORE; // 데이터 0 → 1(누적 인기만), 충분 → 0
  const hotScore = (it) => hotOf(it) + lam * fillOf(it);
  const hotList = active.filter(inStock).sort((a, b) =>
    hotScore(b) - hotScore(a)
    || (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0)
    || (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
    || (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0));
  const hot = hotList.slice(0, 2);
  const hotIds = new Set(hot.map(sid));

  // ── 2) ○○에게 맞는 ──
  const mine = me && Array.isArray(me.purchases) ? me.purchases : [];
  const myId = me?.userId ? String(me.userId) : "";
  const tierIdx = me ? getTierIndex(Number(me.level) || 0) : -1;
  const tierName = me ? VOICE_TIERS[tierIdx]?.name || "" : "";
  // 📌 1개 단위 상품(lib/unitSale.js)은 가져도 "none" — 더 살 수 있어 추천 후보에 남는다(app/arctic/owned.ts ownStateOf 와 같다)
  const stateOf = (it) => {
    if (isUnitSale(it)) return "none";
    const live = liveOf(mine, it, nowMs);
    if (!live.length) return "none";
    return live.some((p) => !p.expiresAt) ? "forever" : "timed";
  };
  const states = new Map(active.map((it) => [sid(it), me ? stateOf(it) : "none"]));

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

  const tierMap = me ? st.tier.get(tierIdx) : null;
  const buyersIn = (map, id) => {
    const s = map?.get(id);
    if (!s) return 0;
    return myId && s.has(myId) ? s.size - 1 : s.size;
  };

  const budget = me ? Math.max(0, Number(me.xp) || 0) + pointToXp(me.point ?? 0) : null;
  // 📌 빙옥 전용 상품은 빙옥만으로 산다 — 예산도 빙옥 × 1,000 (lib/shopPricing affordFor 와 같은 기준)
  const budgetOf = (it) => (isPointOnly(it) ? pointToXp(me?.point ?? 0) : budget);
  const sorted = [...active].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const rankOf = new Map(sorted.map((it, i) => [sid(it), sorted.length > 1 ? i / (sorted.length - 1) : 0]));
  const seed = `${myId || "anon"}:${kstDateOf(nowMs)}`;
  const cands = active.filter((it) => inStock(it) && !hotIds.has(sid(it)) && states.get(sid(it)) === "none");
  // 비로그인("처음이라면")은 예산을 모른다 — 대신 가벼운 값(가장 싼 기간 기준)일수록 조금 앞으로
  const byCheap = me ? [] : [...cands].sort((x, y) => cheapest(x) - cheapest(y));
  const cheapRank = new Map(byCheap.map((it, i) => [sid(it), byCheap.length > 1 ? i / (byCheap.length - 1) : 0]));

  const scoreOf = (it, pick) => {
    const id = sid(it);
    const A = me ? buyersIn(tierMap, id) : buyersIn(st.all30, id); // 비로그인은 전체 30일 인기
    const a = A >= TIER_MIN ? A / (A + 2) : 0;
    const c = co.get(id);
    const b = c ? c.s : 0;
    // 예산 적합도 — 걸린 값이 예산의 30~100% 면 가산 (너무 싼 것만 권하지 않게)
    const bud = me ? budgetOf(it) : 0;
    const fit = me
      ? (bud && pick && pick.price >= bud * 0.3 && pick.price <= bud ? 0.2 : 0)
      : 0.15 * (1 - (cheapRank.get(id) ?? 1));
    // 기본 순서 — 지금 규칙(권한 · 아이템 · 꾸미기 먼저, 관리자 추천 순서)을 작은 가중치로 남긴다
    const prior = (it.type === "perk" || it.type === "item" || it.type === "cosmetic" ? 0.06 : 0) + 0.04 * (1 - (rankOf.get(id) ?? 1));
    // 하루 고정 시드 — 비슷한 점수끼리 매일 조금씩 자리를 바꾼다
    const jitter = 0.08 * seededRand(`${seed}:${id}`);
    return { it, pick, a, b, score: a + 0.8 * b + fit + prior + jitter };
  };

  let pool;
  let fillers = [];
  if (me) {
    // 살 수 있는 것 — 어느 기간이든 예산 안이면(카드에 걸릴 값은 cardPick: 무제한 > 가장 긴 기간)
    pool = [];
    for (const it of cands) {
      const pick = cardPick(it, affordFor(it, me.xp, me.point ?? 0));
      if (pick) pool.push(scoreOf(it, pick)); else fillers.push(scoreOf(it, null));
    }
    // 예산 안에 드는 게 모자라면 가장 가까운 것(가장 싼 값이 예산에 가까운 순)으로 채운다
    //    (여기 든 것은 모든 기간이 예산보다 비싸다 — 가장 싼 값이 낮을수록 가깝다)
    fillers.sort((x, y) => cheapest(x.it) - cheapest(y.it) || y.score - x.score);
  } else {
    pool = cands.map((it) => scoreOf(it, null));
  }
  pool.sort((x, y) => y.score - x.score);

  let picks = takeDiverse(pool, 2, []);
  if (picks.length < 2) picks = [...picks, ...takeDiverse(fillers, 2 - picks.length, picks)];

  let title;
  let basis;
  const tierEv = picks.reduce((s, x) => s + x.a, 0);
  const coEv = picks.reduce((s, x) => s + 0.8 * x.b, 0);
  if (!me) {
    title = "처음이라면";
    basis = tierEv > 0 ? "popular" : "fit";
  } else if (coEv > 0 && coEv > tierEv) {
    title = "함께 많이 산"; basis = "co";
  } else if (tierEv > 0) {
    title = `${tierName}에게 인기`; basis = "tier";
  } else {
    title = `${tierName}에게 맞는`; basis = "fit";
  }

  // 그래도 모자라면(거의 다 가짐) 기간제로 채운다 — 지금 화면 규칙과 같다
  if (picks.length < 2) {
    const have = new Set(picks.map((x) => sid(x.it)));
    const timed = active.filter((it) => isTimed(it) && inStock(it) && !have.has(sid(it)) && !hotIds.has(sid(it)) && states.get(sid(it)) !== "forever");
    if (timed.length) {
      picks = [...picks, ...timed.map((it) => ({ it }))].slice(0, 2);
      title = "기간제만 모아보기"; basis = "timed";
    }
  }

  // ── 3) 곧 만료되는 내 기간제 — 다음 작업(연장 권유)용. 화면은 아직 쓰지 않는다 ──
  const renewSoon = [];
  if (me) {
    for (const it of active) {
      if (states.get(sid(it)) !== "timed") continue;
      if (!durationOptions(it).some((o) => Number(o.days) > 0)) continue; // 기간제로 다시 살 수 없으면 연장도 없다
      const until = Math.max(...liveOf(mine, it, nowMs).map((p) => ms(p.expiresAt)));
      if (until - nowMs <= RENEW_SOON_DAYS * DAY) renewSoon.push({ id: sid(it), expiresAt: new Date(until).toISOString() });
    }
    renewSoon.sort((x, y) => ms(x.expiresAt) - ms(y.expiresAt));
  }

  // ── 4) 이번 주 — 살아 있는 할인 중 종료 임박 · 할인율 · 요즘 인기를 섞어 하나. 없으면 신상품 ──
  const maxHot = Math.max(0, ...active.map(hotOf));
  const dealScore = (it) => {
    const until = it.discountUntil ? ms(it.discountUntil) : NaN;
    const urgency = Number.isFinite(until) ? Math.max(0, Math.min(1, 1 - (until - nowMs) / (7 * DAY))) : 0; // 일주일 안에 끝나면 가까울수록 1
    const pct = discountPctOf(it, nowMs) / 100;
    return 0.4 * urgency + 0.4 * pct + 0.2 * (maxHot > 0 ? hotOf(it) / maxHot : 0);
  };
  const sale = active.filter((it) => inStock(it) && discountActive(it, nowMs))
    .sort((a, b) => dealScore(b) - dealScore(a) || (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0) || (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))[0];
  const byNew = (list) => [...list].sort((a, b) => (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0))[0];
  const fresh = sale ? null : byNew(active.filter(inStock)) || byNew(active);
  const deal = sale ? { id: sid(sale), kind: "sale" } : fresh ? { id: sid(fresh), kind: "new" } : null;

  return {
    hot: hot.map(sid),
    forMe: { title, ids: picks.map((x) => sid(x.it)), basis },
    deal,
    renewSoon,
  };
}

// ── 관련 상품 (상품 상세 '다른 상품도 둘러보세요') — 요청마다 ──
//    baseId : 보고 있는 상품 id
//    items · me · now : recommend 와 같다
//    반환 : [상품 id] 최대 n 개(기본 4)
//    점수 = 함께 산(이 상품을 산 다른 구매자들이 c 도 산 비율 — 그런 사람이 2명 이상일 때만)
//         + 요즘 인기 + 내 등급 인기(비로그인은 전체 30일 인기, 2명 이상일 때만) + 같은 유형 + 비슷한 가격대
//         + 작은 기본 순서 + 하루 고정 흔들림(같은 유저 · 같은 날 · 같은 상품이면 같은 자리 — 새로고침마다 안 바뀐다)
//    제외 : 이 상품 · 내가 가진 것(기간제 포함) · 품절 · 판매 중 아님
//    📌 결과는 id 만 — 누가 무엇을 샀는지는 밖으로 나가지 않는다(함께 산 · 등급 인기 모두 2명 이상 규칙 유지)
export const RELATED_N = 4;
export function related({ stats, items, baseId, me = null, now = Date.now(), n = RELATED_N } = {}) {
  const nowMs = Number(now);
  const st = stats || buildStats({ purchases: [], levels: {}, now: nowMs });
  const active = (Array.isArray(items) ? items : []).filter((it) => it && it._id && it.active !== false);
  const sid = (it) => String(it._id);
  const bid = String(baseId || "");
  const base = active.find((it) => sid(it) === bid) || (Array.isArray(items) ? items : []).find((it) => it && String(it._id) === bid) || null;

  const mine = me && Array.isArray(me.purchases) ? me.purchases : [];
  const myId = me?.userId ? String(me.userId) : "";
  const owns = (it) => !!me && !isUnitSale(it) && liveOf(mine, it, nowMs).length > 0;

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

  const maxHot = Math.max(0, ...active.map((it) => st.hot.get(sid(it)) || 0));
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
        + 0.3 * (maxHot > 0 ? (st.hot.get(id) || 0) / maxHot : 0)
        + (base && it.type === base.type ? 0.25 : 0)
        + 0.2 * near(it)
        + 0.04 * (1 - (rankOf.get(id) ?? 1))
        + 0.12 * seededRand(`${seed}:${id}`);
      return { id, score };
    })
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, Math.max(0, n)).map((x) => x.id);
}

// 한 번에 — 테스트 · 점검 스크립트용 (API 는 buildStats 를 캐시하고 recommend 만 요청마다 부른다)
export const recommendFrom = ({ purchases, levels, items, me, now = Date.now() } = {}) =>
  recommend({ stats: buildStats({ purchases, levels, now }), items, me, now });
