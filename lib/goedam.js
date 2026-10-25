import crypto from "node:crypto";
import mongoose from "mongoose";
import Goedam from "@/models/Goedam";
import GoedamWatch from "@/models/GoedamWatch";
import GoedamDraw from "@/models/GoedamDraw";
import GoedamStock from "@/models/GoedamStock";
import GoedamCode from "@/models/GoedamCode";
import Purchase from "@/models/Purchase";
import Payout from "@/models/Payout";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import ShopLock from "@/models/ShopLock";
import XpLog from "@/models/XpLog";
import { addPoints } from "@/lib/points";
import { logWallet } from "@/lib/wallet";
import { unitThingSet } from "@/lib/unitSale";
import { unconsume } from "@/lib/itemConsume";
import { catalogFind } from "@/lib/catalogDraft";
import { saleEnded } from "@/lib/saleWindow";
import { eventItemStates } from "@/lib/eventPass";
import { fetchGuildMember } from "@/lib/discordMember";
import {
  GOEDAM_KEY,
  GOEDAM_DRAW_BY,
  GOEDAM_SOURCE,
  GOEDAM_ITEM_ID,
  GOEDAM_POINT_KIND,
  GOEDAM_DEFAULTS,
  PRIZE_KINDS,
  PRIZE_COUNT,
  iso,
  normalizeGoedamConfig,
  phaseOf,
  needSeconds,
  watchPct,
  prizeTitle,
  weightOf,
  totalWeight,
  pickByWeight,
  ticketOrderId,
  ticketPurchaseDocs,
  VOICE_LOG_SEC,
  VOICE_SID_PREFIX,
  voiceOn,
  voiceNeedSeconds,
  voicePct,
  voiceDayKey,
  voiceTodayRange,
  voiceSecOf,
  voiceSid,
  voiceDayOf,
  voiceTicketNote,
} from "@/lib/goedamRules";

// 📌 방구석 심야 괴담회(2026-10-23 운영자 결정 — 약속 문서 .claude/mockups/goedam/SPEC.md) 계산의 단일 진실 —
//    조회(GET /api/goedam) · 추첨(POST /api/goedam/draw) · 관리(app/api/admin/goedam/**)가 반드시 이 파일을 함께 쓴다.
//    클라이언트가 보낸 추첨권 수 · 남은 수 · 결과는 절대 믿지 않는다(lib/eventPass.js 와 같은 원칙).
//    · 추첨권 = 설정의 추첨권 아이템(ticketItemId)을 가진 개수(1장 = Purchase 1건 — 2026-10-24부터 받은 길과 상관없이, 아래 「추첨권」).
//      받는 길: 상영 완청 · 음성 활동이면 봇이(bot/src/features/goedamWatch.js) · 못 했으면 관리자가 손으로(grantGoedamTickets) · 상점 판매(상점 관리 상품)
//    · 추첨 = 즉석 뽑기 — 추첨권 1장 = 1번. 상품 · 수량 · 비중은 관리자가 등록(models/Goedam prizes), 다 나간 상품은 안 나온다
//    · 지급 표식은 이벤트 패스와 같은 대우, 글자만 괴담회 것(lib/goedamRules.js — Payout.source "goedam" · Purchase.itemId "goedam" · WalletLog "goedam-point")
//    · 키 · 기본값 · 설정 정리 · 비중 고르기(DB 없음)는 lib/goedamRules.js — 여기서 그대로 다시 내보낸다(화면은 그 파일을 직접 읽는다)
export * from "@/lib/goedamRules";

const refusal = (status, error) => ({ ok: false, status, error });
const isDup = (e) =>
  e?.code === 11000 ||
  (Array.isArray(e?.writeErrors) && e.writeErrors.length > 0 && e.writeErrors.every((w) => (w?.code ?? w?.err?.code) === 11000));
// 내 당첨 기록 · 관리 화면 기록 수
const HISTORY_MAX = 100;
const ADMIN_DRAWS_MAX = 300;
const ROSTER_MAX = 3000;
// 실사이트에 없는 아이템(반영 전 · 지워짐) — grantGoedamPrize 가 이 표시를 달아 던진다
const NOT_LIVE = "GOEDAM_ITEM_NOT_LIVE";

// ── 인덱스 ─────────────────────────────────────────
// 📌 테스트 사이트(localhost)도 같은 DB 를 읽는다 — 모델마다 autoCreate · autoIndex 를 꺼 두고(models/Goedam*), 처음 쓰기 직전에 한 번 만든다.
//    실패하면 다음 쓰기가 다시 만든다(lib/eventPass.js ensureClaimIndexes 와 같은 방식)
const indexJobs = new Map();
const ensureIndexes = (Model) => {
  let job = indexJobs.get(Model.modelName);
  if (!job) {
    job = Model.createIndexes().catch((e) => {
      indexJobs.delete(Model.modelName);
      throw e;
    });
    indexJobs.set(Model.modelName, job);
  }
  return job;
};
export const ensureGoedamIndexes = (...models) => Promise.all(models.map(ensureIndexes));

// ── 설정 ─────────────────────────────────────────
// 설정 읽기 — 늘 .lean() + 정리(스키마로 되살려 쓰지 않는다)
export async function loadGoedamConfig() {
  return normalizeGoedamConfig(await Goedam.findOne({ key: GOEDAM_KEY }).lean());
}
// 📌 추첨권 아이템 id + 추첨 마감(Date — 끝은 들어가지 않는다) — 인벤토리 · 관리 아이템 목록 · 수동 지급이 가볍게 읽는다(설정 두 칸).
//    2026-10-25 운영자 "11월 5일 이후 미사용 수량은 자동 소멸인데 기간 영구로 나옴" — 추첨권은 어디서 받았든(상영 · 음성 · 그룹 · 초대 · 상점 · 상품 · 수동 지급)
//    추첨 마감에 끝나는 것으로 본다(지급 기록마다 만료를 쓰지 않고 읽을 때 맞춘다 — 봇이 낱장마다 만료 DM 을 보내지 않게)
export async function goedamTicketInfo() {
  const c = normalizeGoedamConfig(await Goedam.findOne({ key: GOEDAM_KEY }, { _id: 0, ticketItemId: 1, drawClosesAt: 1 }).lean());
  return { id: c.ticketItemId, closesAt: c.drawClosesAt };
}

// ── 추첨권 ────────────────────────────────────────
// 📌 2026-10-24 운영자 "디코 일정 시간한 것도 지급할 거고 상점에도 판매할 거라서" — 추첨권 수 = 설정의 추첨권 아이템(ticketItemId)을 가진 개수.
//    어디서 받았든(상영 완청 · 음성 활동 · 상점 구매 · 운영진 지급 · 이벤트 보상 · 그 밖에 그 아이템을 주는 모든 길) 같은 아이템이면 한 장이다.
//    셈 · 쓰기 기준은 lib/itemConsume.js consumeOne(= 인벤토리 ×N 묶음의 보유 판정)과 같다 — 그 파일의 기준을 고치면 같이:
//      · 후보: 이 유저의 보유 건 — 대기 · 완료, 소모 안 됨, 기간 남음, 기프트카드 아님, 역할 없음 /
//        그 아이템으로 받은 건(itemRef) + 그 아이템을 가리키는 상품으로 산 건(itemId = 상품 id — thingFilter "i:<id>")
//      · 순서: 만료가 있는 것(먼저 끝나는 것부터) → 먼저 받은 것(createdAt 오름차순) → _id
//      · 갱신: { _id, consumedAt: null, status: 대기 · 완료 } 조건부 — 경합으로 못 세우면 다음 후보. 되돌리기는 unconsume 그대로
//    consumeOne 을 그대로 부르지 않는 까닭 — 그 함수는 ×N 묶음(1개 단위 상품 · 소모형 효과 아이템)만 쓰는데, 추첨권 아이템은 효과 없는 보통 아이템일 수 있다
//    (인벤토리도 설정의 ticketItemId 로 따로 묶는다 — lib/inventory.js). 옛 셈(itemId "goedam-ticket" 만)은 버렸다 — 그 표식은 출처 표시로만 남는다
const OWN = ["pending", "completed"];
const tms = (d) => (d ? new Date(d).getTime() : 0);
async function ticketFilter(userId, cfg, now = new Date()) {
  const id = cfg.ticketItemId;
  const shops = await ShopItem.find({ itemId: id }, { _id: 1 }).lean();
  return {
    userId,
    status: { $in: OWN },
    consumedAt: null,
    itemType: { $ne: "physical" },
    roleId: { $in: ["", null] },
    $and: [
      { $or: [{ itemRef: id }, ...(shops.length ? [{ itemId: { $in: shops.map((s) => String(s._id)) } }] : [])] },
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    ],
  };
}
// 내 추첨권 수 — 로그인 아님 · 추첨권 아이템을 아직 안 정했으면 0
export async function countGoedamTickets(userId, cfg, now = new Date()) {
  if (!userId || !cfg?.ticketItemId) return 0;
  return Purchase.countDocuments(await ticketFilter(userId, cfg, new Date(now)));
}
// 📌 1장 쓰기 — 쓸 순서(위)의 첫 건에 { consumedAt: null } 조건부로 consumedAt · consumedBy "goedam-draw"(consumeOne 과 같은 갱신).
//    경합으로 못 세우면 다음 건. 반환 { _id, at } | null
async function spendTicket(userId, cfg, at) {
  const rows = await Purchase.find(await ticketFilter(userId, cfg, at), { _id: 1, expiresAt: 1, createdAt: 1 }).lean();
  rows.sort((a, b) => {
    const ea = tms(a.expiresAt), eb = tms(b.expiresAt);
    if (!!ea !== !!eb) return ea ? -1 : 1; // 만료가 있는 것 먼저
    return (ea - eb) || (tms(a.createdAt) - tms(b.createdAt)) || String(a._id).localeCompare(String(b._id));
  });
  for (const r of rows) {
    const u = await Purchase.updateOne({ _id: r._id, consumedAt: null, status: { $in: OWN } }, { $set: { consumedAt: at, consumedBy: GOEDAM_DRAW_BY } });
    if (u.modifiedCount === 1) return { _id: r._id, at };
  }
  return null;
}
// 되돌리기 — 그 시각에 이 추첨이 세운 것만 푼다(lib/itemConsume.js unconsume)
const returnTicket = (t) =>
  unconsume(t._id, t.at)
    .then((ok) => {
      if (!ok) console.error("[goedam] 추첨권 되돌리기 못 함(이미 바뀐 건) — 수동 확인 필요", { ticketId: String(t._id) });
    })
    .catch((e) => console.error("[goedam] 추첨권 되돌리기 실패 — 수동 확인 필요", { ticketId: String(t._id), err: e?.message }));

// ── 상품 상태 ──────────────────────────────────────
// 📌 상품별 나간 수 · 코드 수 → (상품) → { given, total, left }. total · left null = 무제한. code 는 코드 풀(전체 · 안 나간 것)
async function prizeStockOf(cfg) {
  const codePids = cfg.prizes.filter((p) => p.kind === "code").map((p) => p.pid);
  const [stocks, codes] = await Promise.all([
    cfg.prizes.length ? GoedamStock.find({ eventKey: cfg.key }, { _id: 0, pid: 1, given: 1 }).lean() : [],
    codePids.length
      ? GoedamCode.aggregate([
          { $match: { eventKey: cfg.key, pid: { $in: codePids } } },
          { $group: { _id: "$pid", total: { $sum: 1 }, left: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$userId", null] }, null] }, 1, 0] } } } },
        ])
      : [],
  ]);
  const given = new Map(stocks.map((s) => [String(s.pid), Math.max(0, Number(s.given) || 0)]));
  const codeOf = new Map(codes.map((c) => [String(c._id), { total: Number(c.total) || 0, left: Number(c.left) || 0 }]));
  return (p) => {
    const g = given.get(p.pid) || 0;
    if (p.kind === "code") {
      const c = codeOf.get(p.pid) || { total: 0, left: 0 };
      return { given: g, total: c.total, left: c.left };
    }
    if (p.qty == null) return { given: g, total: null, left: null };
    return { given: g, total: p.qty, left: Math.max(0, p.qty - g) };
  };
}

// 아이템 상품 · 추첨권 아이템의 상태(live · draft · missing — lib/eventPass.js eventItemStates 와 같은 낱말)
const itemStatesOf = (cfg) =>
  eventItemStates([...(cfg.ticketItemId ? [cfg.ticketItemId] : []), ...cfg.prizes.filter((p) => p.kind === "item").map((p) => p.itemId)]);

// 📌 줄 수 있는 상품인가 — 아이템은 실사이트 Item 만(초안에만 있으면 그 상품을 고르지 않는다 — 반영 뒤 저절로 나온다),
//    역할은 역할이 있어야, XP · 빙옥은 1 이상이어야. 코드 · 꽝은 늘(코드는 남은 장 수로 따로 거른다)
const readyOf = (p, states) =>
  p.kind === "item"
    ? !!p.itemId && states.get(p.itemId)?.state === "live"
    : p.kind === "role"
      ? !!p.roleId
      : p.kind === "xp" || p.kind === "point"
        ? p.amount > 0
        : PRIZE_KINDS.includes(p.kind);

// ── 상품 고르기 ────────────────────────────────────
// 📌 나간 수 하나 올리기 — 수량이 있으면 { given: { $lt: 수량 } } 조건부(넘칠 자리면 아무것도 안 바꾼다). 반환 true = 이 상품을 잡았다.
//    문서가 아직 없으면 upsert 로 만든다 — 다 나간 문서가 있는데 조건이 안 맞으면 넣기가 유니크(eventKey, pid)에 튕긴다(= 다 나감).
//    동시에 처음 넣으려던 다른 추첨이 먼저 만든 경우도 같은 튕김이라 넣기 없이 한 번 더 묻는다
async function takeStock(cfg, prize, limit) {
  const filter = { eventKey: cfg.key, pid: prize.pid };
  if (limit == null) {
    // 무제한 — 조건 없이 센다(관리 화면 표시용). 처음 넣기가 겹쳐 튕기면 이미 생긴 문서에 한 번 더
    await GoedamStock.updateOne(filter, { $inc: { given: 1 } }, { upsert: true }).catch((e) => {
      if (!isDup(e)) throw e;
      return GoedamStock.updateOne(filter, { $inc: { given: 1 } });
    });
    return true;
  }
  if (!(limit > 0)) return false;
  try {
    const r = await GoedamStock.updateOne({ ...filter, given: { $lt: limit } }, { $inc: { given: 1 } }, { upsert: true });
    return r.modifiedCount + r.upsertedCount > 0;
  } catch (e) {
    if (!isDup(e)) throw e;
    const r = await GoedamStock.updateOne({ ...filter, given: { $lt: limit } }, { $inc: { given: 1 } });
    return r.modifiedCount > 0;
  }
}
const giveBackStock = (cfg, prize) =>
  GoedamStock.updateOne({ eventKey: cfg.key, pid: prize.pid, given: { $gt: 0 } }, { $inc: { given: -1 } }).catch((e) =>
    console.error("[goedam] 나간 수 되돌리기 실패 — 수동 확인 필요", { pid: prize.pid, err: e?.message })
  );
const releaseCode = (codeId, drawId) =>
  GoedamCode.updateOne({ _id: codeId, drawId: String(drawId) }, { $set: { userId: null, drawId: "", at: null } }).catch((e) =>
    console.error("[goedam] 코드 되돌리기 실패 — 수동 확인 필요", { codeId: String(codeId), err: e?.message })
  );

// 📌 남은 상품 중 비중으로 하나 — 약속 문서 순서 그대로:
//    1) 줄 수 있고(readyOf) 남은(left null 또는 > 0) 상품만 후보 — 1인 1개 아이템은 아직 안 가진 사람에게만(heldOnceItems) 2) 비중으로 고른다(lib/goedamRules.js pickByWeight + crypto.randomInt)
//    3) 나간 수 조건부 $inc(takeStock) — 못 잡으면 그 상품을 빼고 다시 4) code 면 코드 한 장 조건부 배정 — 못 받으면 나간 수를 되돌리고 그 상품을 빼고 다시.
//    반환 { prize, code, codeId } | null(남은 상품 없음) — 아이템 상품은 count 가 실제로 줄 개수(itemCountOf — 기록 · 이름 · 지급이 같은 수). 도중에 던지면 잡아 둔 나간 수 · 코드를 되돌리고 그대로 던진다
async function pickPrize(cfg, { userId, drawId, at }) {
  const [stockOf, states, facts] = await Promise.all([prizeStockOf(cfg), itemStatesOf(cfg), itemPrizeFacts(cfg)]);
  const held = await heldOnceItems(userId, facts);
  const pool = cfg.prizes
    .map((p) => ({ p, s: stockOf(p) }))
    .filter(({ p, s }) => readyOf(p, states) && (s.left == null || s.left > 0) && !(p.kind === "item" && held.has(String(p.itemId))));
  while (pool.length) {
    const sum = totalWeight(pool.map((x) => x.p));
    if (sum <= 0) return null;
    const i = pickByWeight(pool.map((x) => x.p), crypto.randomInt(0, sum));
    if (i < 0) return null;
    const { p: prize, s } = pool[i];
    const limit = prize.kind === "code" ? s.total : prize.qty;
    if (!(await takeStock(cfg, prize, limit))) {
      pool.splice(i, 1);
      continue;
    }
    if (prize.kind !== "code") return { prize: prize.kind === "item" ? { ...prize, count: itemCountOf(prize, facts) } : prize, code: "", codeId: null };
    let c = null;
    try {
      c = await GoedamCode.findOneAndUpdate(
        { eventKey: cfg.key, pid: prize.pid, userId: null },
        { $set: { userId, drawId: String(drawId), at } },
        { sort: { _id: 1 }, returnDocument: "after", projection: { _id: 1, code: 1 } }
      ).lean();
    } catch (e) {
      await giveBackStock(cfg, prize);
      throw e;
    }
    if (c) return { prize, code: String(c.code || ""), codeId: c._id };
    await giveBackStock(cfg, prize);
    pool.splice(i, 1);
  }
  return null;
}

// ── 지급 ─────────────────────────────────────────
// 📌 아이템 상품 판정(2026-10-25 기간 대신 개수) — 실사이트 Item · 상품으로만 본다(지급과 같은 자료 — 관리 저장 검사 app/api/admin/goedam 도 같다).
//    쌓임(stackable) = 괴담회 추첨권 아이템 · 1개 단위로 파는 상품이 가리키거나 소모형(lib/unitSale.js unitThingSet — 관리자 수동 지급 · 시즌 패스와 같은 판정) → 설정 개수만큼
//    안 쌓이는 아이템은 1개 · 1인 1개(once) — 이미 살아 있는 채로 가졌으면 그 사람의 후보 · 확률에서 뺀다(같은 물건을 한 장 더 만들지 않고, 추첨권 · 한정 수량만 날리지 않게).
//    실물(기프트카드)은 한 장씩 따로 쓰는 물건이라 가졌어도 또 준다(옛 동작 그대로)
//    반환 Map<itemId, { stackable, once, shopIds }>
async function itemPrizeFacts(cfg) {
  const ids = [...new Set(cfg.prizes.filter((p) => p.kind === "item" && mongoose.isValidObjectId(p.itemId)).map((p) => String(p.itemId)))];
  if (!ids.length) return new Map();
  const [items, shops] = await Promise.all([
    Item.find({ _id: { $in: ids } }).lean(),
    ShopItem.find({ itemId: { $in: ids } }, { type: 1, roleId: 1, itemId: 1, unitSale: 1, durations: 1 }).lean(),
  ]);
  const units = unitThingSet(shops, items);
  const ticket = String(cfg.ticketItemId || "");
  return new Map(
    items.map((it) => {
      const id = String(it._id);
      const stackable = id === ticket || units.has(`i:${id}`);
      return [id, { stackable, once: !stackable && it.type !== "physical", shopIds: shops.filter((x) => String(x.itemId) === id).map((x) => String(x._id)) }];
    })
  );
}
// 📌 그 사람이 이미 가진 1인 1개 아이템 상품(itemId Set) — 어디서 받았든(가리키는 상품으로 산 것 포함). 다 쓴 것 · 끝난 기간제는 빼고
async function heldOnceItems(userId, facts) {
  const once = [...facts].filter(([, x]) => x.once);
  if (!userId || !once.length) return new Set();
  const ids = once.map(([id]) => id);
  const shopTo = new Map(once.flatMap(([id, x]) => x.shopIds.map((sid) => [sid, id])));
  const rows = await Purchase.find(
    {
      userId,
      status: { $in: ["pending", "completed"] },
      consumedAt: null,
      $and: [
        { $or: [{ itemRef: { $in: ids } }, ...(shopTo.size ? [{ itemId: { $in: [...shopTo.keys()] } }] : [])] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
    },
    { itemRef: 1, itemId: 1 }
  ).lean();
  const held = new Set();
  for (const r of rows) {
    const ref = String(r.itemRef || "");
    if (ids.includes(ref)) held.add(ref);
    else if (shopTo.has(String(r.itemId))) held.add(shopTo.get(String(r.itemId)));
  }
  return held;
}
// 아이템 상품의 실제 개수 — 쌓이는 아이템만 설정 개수(1~99), 그 밖 1(설정 뒤 상점이 바뀌었어도 지금 판정으로)
const itemCountOf = (prize, facts) =>
  facts.get(String(prize.itemId))?.stackable ? Math.min(PRIZE_COUNT.max, Math.max(PRIZE_COUNT.min, Math.floor(Number(prize.count)) || PRIZE_COUNT.def)) : 1;

const num = (v, max = 1_000_000_000) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
};

// 📌 상품 지급 — 이벤트 패스 grantEventReward(lib/eventPass.js)와 같은 길, 표식만 괴담회 것:
//    xp   : Payout 대기열(source GOEDAM_SOURCE — 봇이 지급 + 레벨 재계산 + 역할 동기화, 기준선도 같이 올린다)
//    point: addPoints 로 바로(원장은 추첨이 한 줄로 — drawGoedam)
//    role : Purchase 대기열(itemId GOEDAM_ITEM_ID) — 봇이 역할을 붙인다
//    item : Purchase(itemRef) 개수만큼(한 주문 — 무기한). 쌓이지 않는 아이템은 1개 · 1인 1개를 이미 가졌으면 받은 것으로 친다(itemPrizeFacts · heldOnceItems — 고르기가 먼저 빼서 겹칠 때만)
//    code : 코드 배정이 곧 지급(pickPrize) · none(꽝) : 줄 것 없음
//    label — 받은 줄 이름("방구석 심야 괴담회 · 상품 이름"). Payout.reason · Purchase.adminNote · 역할 이름 꼬리에 쓴다
//    ticketItemId — 설정의 추첨권 아이템(늘 쌓이는 아이템으로 본다 — 「한 번 더」 같은 추첨권 상품)
export async function grantGoedamPrize(userId, prize, label, userName = "", { ticketItemId = "" } = {}) {
  const kind = prize?.kind;
  const amount = num(prize?.amount);
  const result = { kind: kind || "none", amount, label, queued: false, point: null };

  if (kind === "xp") {
    await Payout.create({ userName: userName || userId, userId, amount, reason: label, source: GOEDAM_SOURCE });
    result.queued = true;
    return result;
  }

  if (kind === "point") {
    const doc = await addPoints(userId, amount);
    result.point = doc?.point ?? null;
    return result;
  }

  if (kind === "role") {
    await Purchase.create({
      userId,
      userName,
      itemId: GOEDAM_ITEM_ID,
      // itemName 이 인벤토리 카드 · 봇 로그 · DM 에 그대로 찍힌다 — 역할 이름을 앞에 둔다(이벤트 패스와 같은 모양)
      itemName: `${prize.roleName || "역할"} (${label})`,
      adminNote: label,
      itemType: "role",
      roleId: prize.roleId,
      price: 0,
      payMethod: "xp",
      paidXp: 0,
      paidPoint: 0,
      days: 0,
      status: "pending",
    });
    result.queued = true;
    return result;
  }

  if (kind === "item") {
    // 📌 지급은 늘 실사이트 Item — 초안에만 있는(반영 전) 아이템은 주지 않는다(고르기에서 이미 빠진다 — readyOf)
    const item = await Item.findById(prize.itemId).lean().catch(() => null);
    if (!item) throw Object.assign(new Error(`괴담회 아이템 상품을 찾을 수 없습니다: ${prize.itemId}`), { code: NOT_LIVE });
    const hasRole = !!item.roleId;
    const facts = await itemPrizeFacts({ ticketItemId, prizes: [prize] });
    if (facts.get(String(item._id))?.once && (await heldOnceItems(userId, facts)).size) {
      // 이미 가진 1인 1개 아이템 — 만들지 않고 받은 것으로 친다(이벤트 패스와 같다). 추첨은 고르기에서 먼저 빼므로 겹친 순간(상점 구매 등)에만 온다
      result.kept = true;
      return result;
    }
    // 개수 — 쌓이는 아이템만 여러 개(관리 저장도 같은 규칙으로 막는다 — 그 뒤 상점 설정이 바뀌었으면 1개)
    const count = itemCountOf(prize, facts);
    const orderId = new mongoose.Types.ObjectId().toString();
    const now = new Date();
    await Purchase.insertMany(
      Array.from({ length: count }, () => ({
        orderId,
        createdAt: now,
        userId,
        userName,
        itemId: GOEDAM_ITEM_ID,
        itemRef: String(item._id),
        itemName: item.name,
        adminNote: label,
        itemType: item.type,
        roleId: item.roleId || "",
        price: 0,
        payMethod: "xp",
        paidXp: 0,
        paidPoint: 0,
        days: 0,
        expiresAt: null,
        status: hasRole ? "pending" : "completed",
        processedAt: hasRole ? null : now,
      }))
    );
    result.queued = hasRole;
    result.count = count;
    return result;
  }

  // code · none — 줄 것 없음
  return result;
}

// 받은 줄 이름 — Payout.reason · 원장 · Purchase.adminNote
const labelOf = (cfg, prize) => `${cfg.title} · ${prizeTitle(prize)}`;
// 결과 · 기록 한 줄의 표시 재료(설정의 지금 상품에서 — 지운 상품이면 기록 스냅샷만)
const resultOf = (id, prize, d, extra = {}) => ({
  id: String(id),
  pid: prize?.pid || d?.pid || "",
  name: d?.prizeName || prizeTitle(prize),
  kind: d?.kind || prize?.kind || "none",
  amount: Number(d?.amount ?? prize?.amount) || 0,
  itemName: prize?.kind === "item" ? prize.itemName : "",
  count: prize?.kind === "item" ? Number(d?.count) || prize.count || 1 : 0,
  rarity: prize?.rarity || "",
  code: d?.code || "",
  ...extra,
});

// ── 추첨 ─────────────────────────────────────────
// 📌 즉석 뽑기 한 번 — 약속 문서 순서:
//    1) 기간 확인 — 단계 open 일 때만(운영진도 open 일 때만 실제로 뽑는다). 꺼져 있으면 운영진만(미리보기 — isAdmin 은 「유저 화면으로 보기」를 따른 값)
//    2) 한 사람 동시 요청은 자물쇠 하나(ShopLock 컬렉션, 키 "goedam:<userId>" — 상점 결제 자물쇠와 갈라 둔다).
//       이미 잡혀 있으면 기다리지 않고 거절(두 번 누름)
//    3) 추첨권 1장 소모(조건부) 4) 남은 상품 중 비중으로 고르기(pickPrize — 나간 수 조건부 $inc · 코드 조건부 배정)
//       → 남은 상품이 하나도 없으면 추첨권을 되돌리고 "남은 상품이 없습니다"
//    5) 추첨 기록(GoedamDraw) — 못 남기면 잡아 둔 나간 수 · 코드 · 추첨권을 되돌리고 오류
//    6) 지급(grantGoedamPrize) — 실패해도 결과는 그대로(같은 상품을 두 번 주지 않게) granted false + error 로 남긴다 → 관리 › 추첨 기록 「다시 지급」
//    반환 { ok: true, result, tickets(남은 수) } · { ok: false, status, error }
// 📌 2026-10-24 운영자 "추첨권 1장 / 10장 으로 버튼" — count 는 1 또는 10(DRAW_COUNTS). 10장은 10장 이상 가졌을 때만(모자라면 거절 — 운영자 선택 「잠김」).
//    한 사람 자물쇠 안에서 1장 쓰기 → 1개 고르기 → 기록 → 지급을 count 번 되풀이한다(한 번 = 1장 때와 같은 순서 · 같은 되돌림). 중간에 상품이 다 나가면 거기서 멈추고
//    못 쓴 추첨권은 그대로 둔다(그때까지 뽑은 결과만 돌려준다). 기록 시각은 1ms 씩 밀어 내 당첨 순서가 뽑은 순서와 같게
export const DRAW_COUNTS = [1, 10];
export async function drawGoedam({ userId, userName = "", isAdmin = false, now = Date.now(), count = 1 }) {
  if (!userId) return refusal(401, "로그인이 필요합니다.");
  const n = DRAW_COUNTS.includes(Number(count)) ? Number(count) : 1;
  const cfg = await loadGoedamConfig();
  if ((!cfg.enabled && !isAdmin) || phaseOf(cfg, now) !== "open") return refusal(403, "추첨 기간이 아닙니다.");
  if (!cfg.ticketItemId) return refusal(409, "추첨권이 없습니다.");

  const lock = await ShopLock.acquire(`goedam:${userId}`);
  if (!lock) return refusal(409, "처리 중인 추첨이 있습니다. 잠시 뒤 다시 시도해 주세요.");
  try {
    await ensureGoedamIndexes(GoedamDraw, GoedamStock, GoedamCode);
    if (n > 1 && (await countGoedamTickets(userId, cfg, now)) < n) return refusal(409, "추첨권이 부족합니다.");
    const results = [];
    let stop = "";
    for (let i = 0; i < n; i++) {
      const one = await drawOnce(cfg, { userId, userName, at: new Date(now + i) });
      if (one.stop) { stop = one.stop; break; }
      results.push(one.result);
    }
    if (!results.length) return refusal(409, stop === "ticket" ? "추첨권이 없습니다." : "남은 상품이 없습니다.");
    const tickets = await countGoedamTickets(userId, cfg).catch(() => 0);
    return { ok: true, result: results[0], results, tickets };
  } finally {
    await ShopLock.release(lock);
  }
}

// 한 장 — 추첨권 쓰기 → 고르기 → 기록 → 지급. 자물쇠는 부르는 쪽(drawGoedam)이 잡는다. { result } | { stop: "ticket" | "prize" }
async function drawOnce(cfg, { userId, userName, at }) {
  const ticket = await spendTicket(userId, cfg, at);
  if (!ticket) return { stop: "ticket" };

  const drawId = new mongoose.Types.ObjectId();
  let picked;
  try {
    picked = await pickPrize(cfg, { userId, drawId, at });
  } catch (e) {
    await returnTicket(ticket);
    throw e;
  }
  if (!picked) {
    await returnTicket(ticket);
    return { stop: "prize" };
  }

  const { prize, code, codeId } = picked;
  try {
    await GoedamDraw.create({
      _id: drawId,
      eventKey: cfg.key,
      userId,
      userName,
      pid: prize.pid,
      prizeName: prizeTitle(prize),
      kind: prize.kind,
      amount: prize.kind === "xp" || prize.kind === "point" ? prize.amount : 0,
      count: prize.kind === "item" ? prize.count : 0,
      code,
      ticketId: String(ticket._id),
      granted: false,
      error: "",
      createdAt: at,
    });
  } catch (e) {
    if (codeId) await releaseCode(codeId, drawId);
    await giveBackStock(cfg, prize);
    await returnTicket(ticket);
    throw e;
  }

  const label = labelOf(cfg, prize);
  let granted = false;
  let error = "";
  let g = null;
  try {
    g = await grantGoedamPrize(userId, prize, label, userName, { ticketItemId: cfg.ticketItemId });
    granted = true;
  } catch (e) {
    error = String(e?.message || e).slice(0, 300);
    console.error(`[goedam] 상품 지급 실패 — 추첨 기록 ${drawId} (${userId} ${prize.pid}):`, e);
  }
  await GoedamDraw.updateOne({ _id: drawId }, { $set: { granted, error } }).catch((e) =>
    console.error("[goedam] 추첨 기록 갱신 실패", { drawId: String(drawId), err: e?.message })
  );
  // 이미 가진 1인 1개 아이템이라 만들지 않았다(고르기 뒤 상점 구매 등 겹친 순간) — 한정 수량을 다른 사람 몫으로 되돌린다
  if (g?.kept) await giveBackStock(cfg, prize);
  // 📌 빙옥 상품은 잔액에 바로 들어가고 Payout 이 없다 — 원장에 한 줄(이벤트 패스 claimTier 와 같다 · 종류만 괴담회 것)
  if (granted && prize.kind === "point" && prize.amount > 0) {
    await logWallet({ userId, currency: "point", amount: prize.amount, kind: GOEDAM_POINT_KIND, label, refId: `${cfg.key}:${drawId}` });
  }
  // 📌 계약 밖 덧붙임 — granted(지급 실패면 false · 화면은 결과를 그대로 보여 주고 운영진이 다시 지급한다) · kept(이미 가진 1인 1개 아이템)
  return { result: resultOf(drawId, prize, { code }, { granted, ...(g?.kept ? { kept: true } : {}) }) };
}

// ── 조회 ─────────────────────────────────────────
// 📌 띠 노출 · 띠 배지용(GET /api/goedam?meta=1) — visible = (켜짐 또는 운영진) && 지금 < 추첨 닫힘. 로그인 아니면 tickets 0
export async function getGoedamMeta(userId = "", { isAdmin = false, now = Date.now() } = {}) {
  const cfg = await loadGoedamConfig();
  const end = cfg.drawClosesAt.getTime();
  const visible = (cfg.enabled || !!isAdmin) && now < end;
  const tickets = visible && userId ? await countGoedamTickets(userId, cfg) : 0;
  return { visible, at: now, end, tickets };
}

// ── 받는 법 — 음성 · 상점 ───────────────────────────
// 📌 내 오늘 음성 초 — XpLog { reason: "voice" } 의 sec 합(sec 없는 옛 줄은 VOICE_LOG_SEC). 봇 음성 지급 판정과 같은 셈(채널 조건 없음 — 추후)
//    셀 구간은 봇과 같이 오늘 [0시, 다음 0시) ∩ 음성 기간(voiceTodayRange — 기간 밖이면 0). 정수로 내릴 때 소수 오차는 봇과 같이 봐준다(voiceSecOf)
async function voiceTodaySec(userId, voice, now) {
  const span = voiceTodayRange(voice, now);
  if (!span) return 0;
  const [r] = await XpLog.aggregate([
    { $match: { userId, reason: "voice", createdAt: { $gte: new Date(span.from), $lt: new Date(span.to) } } },
    { $group: { _id: null, s: { $sum: { $ifNull: ["$sec", VOICE_LOG_SEC] } } } },
  ]);
  return voiceSecOf(r?.s);
}

// 📌 추첨권을 파는 상품 하나 — ShopItem { itemId: 추첨권 아이템, 판매 중 } 중 상점 순서(sortOrder → 최신)로 첫 번째.
//    판매 중 = 상점 목록 API(app/api/shop/items GET)와 같은 판정 — active true · 판매 종료(saleUntil) 전, 초안 모드는 초안을 덧씌운 보기(catalogFind).
//    href 는 ARCTIC 상품 상세(app/arctic/item/[id] — 상점 카드 · 홈이 여는 주소 그대로). 없으면 null
const SHOP_SORT = { sortOrder: 1, createdAt: -1 }; // app/api/shop/items PRODUCT_SORT 와 같다
export async function goedamShopOf(cfg, now = Date.now()) {
  if (!cfg?.ticketItemId) return null;
  const rows = await catalogFind(
    ShopItem,
    { itemId: cfg.ticketItemId, active: true },
    { select: { name: 1, active: 1, saleUntil: 1, sortOrder: 1, createdAt: 1 }, sort: SHOP_SORT }
  );
  const s = rows.find((x) => x.active !== false && !saleEnded(x, now));
  return s ? { id: String(s._id), name: String(s.name || ""), href: `/arctic/item/${s._id}` } : null;
}

// 📌 창 본문(GET /api/goedam) — 계약 모양 그대로 + 계약 밖 덧붙임(at · visible · 상품 ready).
//    꺼져 있으면 운영진만 본다(adminPreview) — 유저에게는 회차 · 상품을 비워 보낸다(약속 문서 「켜기 전엔 운영진 미리보기만」).
//    상품 목록 — 유저에게는 지금 줄 수 있는 상품만(초안 아이템 · 역할 없음 등은 뺀다), 운영진에게는 전부(ready false 로 표시)
//    📌 2026-10-24 「받는 법」 덧붙임(약속 문서 추가 절 4):
//      voice: null | { on, minutes, tickets, startsAt, endsAt, todaySec, todayGranted } — 음성 활동이 꺼져 있으면 유저에게는 null(운영진은 그대로 보되 on false).
//             on = 지금 음성으로 받을 수 있나(lib/goedamRules.js voiceOn — 봇 지급 조건). todayGranted = 오늘 줄(GoedamWatch sid "voice:<오늘>")에 지급 시각이 있다
//      shop : null | { name, href } — 추첨권을 파는 상품(goedamShopOf). shopOpen(ARCTIC 을 볼 수 있나 — 부르는 쪽이 lib/shopAccess 로 센다)이 아니면 null
export async function getGoedamState(userId = "", { isAdmin = false, now = Date.now(), shopOpen = false } = {}) {
  const cfg = await loadGoedamConfig();
  const visible = cfg.enabled || !!isAdmin;
  const head = {
    phase: phaseOf(cfg, now),
    adminPreview: !cfg.enabled && !!isAdmin,
    title: cfg.title,
    drawOpensAt: iso(cfg.drawOpensAt),
    drawClosesAt: iso(cfg.drawClosesAt),
    at: now,
    visible,
  };
  const [tickets, watches, draws] = await Promise.all([
    countGoedamTickets(userId, cfg),
    userId && visible ? GoedamWatch.find({ eventKey: cfg.key, userId }, { _id: 0, sid: 1, seconds: 1, grantedAt: 1, granted: 1 }).lean() : [],
    userId ? GoedamDraw.find({ eventKey: cfg.key, userId }).sort({ createdAt: -1 }).limit(HISTORY_MAX).lean() : [],
  ]);
  const prizeById = new Map(cfg.prizes.map((p) => [p.pid, p]));
  const history = draws.map((d) => {
    const p = prizeById.get(d.pid);
    return { ...resultOf(d._id, p, d), at: iso(d.createdAt) };
  });
  if (!visible) return { ...head, tickets, screenings: [], prizes: [], history, voice: null, shop: null };

  // 음성 줄 — 유저는 음성 활동이 켜져 있을 때만, 운영진은 늘(on 으로 가른다)
  const voiceShown = cfg.voice.enabled || !!isAdmin;
  const [stockOf, states, todaySec, shopRow, facts] = await Promise.all([
    prizeStockOf(cfg),
    itemStatesOf(cfg),
    voiceShown && userId ? voiceTodaySec(userId, cfg.voice, now) : 0,
    shopOpen ? goedamShopOf(cfg, now) : null,
    itemPrizeFacts(cfg),
  ]);
  const held = await heldOnceItems(userId, facts);
  const watchOf = new Map(watches.map((w) => [String(w.sid), w]));
  const voice = voiceShown
    ? {
        on: voiceOn(cfg, now),
        minutes: cfg.voice.minutes,
        tickets: cfg.voice.tickets,
        startsAt: iso(cfg.voice.startsAt),
        endsAt: iso(cfg.voice.endsAt),
        todaySec,
        todayGranted: !!watchOf.get(voiceSid(voiceDayKey(now)))?.grantedAt,
      }
    : null;
  const shop = shopRow ? { name: shopRow.name, href: shopRow.href } : null;
  const screenings = cfg.screenings.map((s) => {
    const w = watchOf.get(s.sid);
    const mySeconds = Math.max(0, Math.floor(Number(w?.seconds) || 0));
    return {
      sid: s.sid,
      title: s.title,
      startsAt: iso(s.startsAt),
      endsAt: iso(s.endsAt),
      tickets: s.tickets,
      ratio: s.ratio,
      mySeconds,
      // 완청 — 받았거나(봇 · 수동) 머문 초가 넘었다(회차가 끝나기 전이면 곧 받는다)
      earned: !!w?.grantedAt || mySeconds >= needSeconds(s),
      granted: w?.grantedAt ? Math.max(0, Number(w.granted) || 0) : 0,
    };
  });
  // 📌 2026-10-25 상품 줄 「확률 · 남은 수」(운영자) — 확률(%)은 뽑기와 같은 후보(pickPrize: 줄 수 있고 · 남은 상품)의 비중 합 중 그 상품 몫.
  //    꽝도 후보라 비중에 든다(창은 꽝 줄을 그리지 않는다 — 보이는 줄 합이 100 이 안 될 수 있다). 후보가 아니면(다 나감 · 준비 안 됨 · 이미 가진 1인 1개 아이템) 0
  //    운영진(미리보기)은 반영 전(초안) 아이템도 확률에 넣는다 — 반영하면 바로 후보가 되니 그 확률을 미리 본다(관리 화면 확률 칸과 같은 셈 · 유저는 그 상품 줄이 아예 안 보인다)
  const rows = cfg.prizes.map((p) => ({ p, s: stockOf(p), ready: readyOf(p, states) }));
  const planned = (r) => r.ready || (!!isAdmin && r.p.kind === "item" && states.get(r.p.itemId)?.state === "draft");
  const pool = rows.filter((r) => planned(r) && (r.s.left == null || r.s.left > 0) && !(r.p.kind === "item" && held.has(String(r.p.itemId))));
  const sum = totalWeight(pool.map((r) => r.p));
  const inPool = new Set(pool.map((r) => r.p.pid));
  const prizes = rows
    .filter((r) => isAdmin || r.ready)
    .map(({ p, s, ready }) => {
      // 아이템은 실제로 줄 개수(itemCountOf — 뽑기 · 지급과 같은 수)로 이름 · 개수를 보인다
      const q = p.kind === "item" ? { ...p, count: itemCountOf(p, facts) } : p;
      return {
        pid: p.pid,
        name: prizeTitle(q),
        kind: p.kind,
        amount: p.amount,
        itemName: p.itemName,
        count: q.count,
        rarity: p.rarity,
        total: s.total,
        left: s.left,
        chance: sum > 0 && inPool.has(p.pid) ? (weightOf(p) / sum) * 100 : 0,
        ready,
      };
    });
  return { ...head, tickets, screenings, prizes, history, voice, shop };
}

// ── 관리자 ─────────────────────────────────────────
// 📌 관리 화면 응답 모양(GET · PUT /api/admin/goedam) — 날짜는 ISO 글자. sid · pid 가 실려 나간다(화면은 그대로 되돌려 보내야 한다)
export const toAdminGoedam = (cfg) => ({
  ...cfg,
  drawOpensAt: iso(cfg.drawOpensAt),
  drawClosesAt: iso(cfg.drawClosesAt),
  screenings: cfg.screenings.map((s) => ({ ...s, startsAt: iso(s.startsAt), endsAt: iso(s.endsAt) })),
  voice: { ...cfg.voice, startsAt: iso(cfg.voice.startsAt), endsAt: iso(cfg.voice.endsAt) },
  updatedAt: cfg.updatedAt ? iso(cfg.updatedAt) : null,
});
// 응답 모양 — Map(id → { state }) → { id: state }
const statesOut = (m) => Object.fromEntries([...m].map(([id, s]) => [id, s.state]));

// 📌 음성 기록이 있는 날 — GoedamWatch 의 sid "voice:<YYYY-MM-DD>" 들(날짜 오름차순). 관리 › 명단의 「음성 M. D.」 고르기
async function goedamVoiceDays(cfg) {
  const sids = await GoedamWatch.distinct("sid", { eventKey: cfg.key, sid: { $regex: `^${VOICE_SID_PREFIX}` } });
  return [...new Set(sids.map(voiceDayOf).filter(Boolean))].sort();
}

// 📌 관리 화면 본문 — { config, itemStates(추첨권 · 아이템 상품 id → live | draft | missing), stock(pid → { given, total, left }),
//    shop(추첨권을 파는 상품 { id, name, href } | null — 2026-10-24 「상점」 줄), voiceDays(음성 기록이 있는 날 ["YYYY-MM-DD"] — 명단 고르기) }.
//    읽기만(문서가 없으면 기본값 — 첫 저장이 만든다)
export async function getGoedamAdmin(cfgIn) {
  const cfg = cfgIn || (await loadGoedamConfig());
  const [stockOf, states, shop, voiceDays] = await Promise.all([prizeStockOf(cfg), itemStatesOf(cfg), goedamShopOf(cfg), goedamVoiceDays(cfg)]);
  return {
    config: toAdminGoedam(cfg),
    itemStates: statesOut(states),
    stock: Object.fromEntries(cfg.prizes.map((p) => [p.pid, stockOf(p)])),
    shop,
    voiceDays,
  };
}

// 📌 명단 기준 — 상영: 비율 = 머문 초 / 회차 길이 · 완청 = needSeconds. 음성(2026-10-24): 비율 = 그날 음성 초 / (분 × 60) · 달성 = 분 × 60 이상(지금 설정의 분)
const screeningJudge = (s) => ({ pct: (sec) => watchPct(sec, s), need: needSeconds(s) });
const voiceJudge = (v) => ({ pct: (sec) => voicePct(sec, v), need: voiceNeedSeconds(v) });
// 명단 한 줄 — 머문 초 · 비율(%) · 완청(음성은 달성) · 지급
const rosterRow = (r, judge) => {
  const seconds = Math.max(0, Math.floor(Number(r?.seconds) || 0));
  return {
    userId: String(r?.userId || ""),
    userName: String(r?.userName || ""),
    seconds,
    pct: judge.pct(seconds),
    earned: seconds >= judge.need,
    grantedAt: iso(r?.grantedAt),
    granted: r?.grantedAt ? Math.max(0, Number(r?.granted) || 0) : 0,
    manual: !!r?.manual,
  };
};

// 📌 명단 대상 — 회차 sid("s1" …) 또는 음성 날 sid("voice:<YYYY-MM-DD>"). 반환 { sid, judge, tickets, note, screening } | null(없는 회차 · 틀린 날짜)
//    tickets · note 는 손 지급(grantGoedamTickets)이 쓴다 — 음성은 지금 설정의 장 수 · 「괴담회 음성 N분 · M. D.」(봇 자동 지급과 같은 글자)
function watchTargetOf(cfg, sid) {
  const key = String(sid || "");
  const day = voiceDayOf(key);
  if (day) return { sid: key, judge: voiceJudge(cfg.voice), tickets: cfg.voice.tickets, note: voiceTicketNote(cfg.voice.minutes, day), screening: { sid: key, title: "" } };
  const s = cfg.screenings.find((x) => x.sid === key);
  return s ? { sid: s.sid, judge: screeningJudge(s), tickets: s.tickets, note: "", screening: s } : null;
}

// 📌 명단(GET /api/admin/goedam?watch=<sid | voice:YYYY-MM-DD>) — 머문 초 많은 순. 없는 회차 · 틀린 날짜면 null(기록 없는 날은 [])
export async function goedamRoster(sid) {
  const cfg = await loadGoedamConfig();
  const t = watchTargetOf(cfg, sid);
  if (!t) return null;
  const rows = await GoedamWatch.find({ eventKey: cfg.key, sid: t.sid }).sort({ seconds: -1, userId: 1 }).limit(ROSTER_MAX).lean();
  return rows.map((r) => rosterRow(r, t.judge));
}

// 📌 최근 추첨 기록(GET /api/admin/goedam?draws=1) — 최신순 300건
export async function goedamDraws() {
  const rows = await GoedamDraw.find({ eventKey: GOEDAM_KEY }).sort({ createdAt: -1 }).limit(ADMIN_DRAWS_MAX).lean();
  return rows.map((d) => ({
    id: String(d._id),
    at: iso(d.createdAt),
    userId: d.userId,
    userName: d.userName || "",
    pid: d.pid,
    prizeName: d.prizeName || "",
    kind: d.kind || "none",
    amount: Number(d.amount) || 0,
    code: d.code || "",
    granted: !!d.granted,
    error: d.error || "",
  }));
}

// 디스코드 표시 이름 — 서버 별명 > 전역 이름 > 아이디. 못 읽으면 ""
async function memberName(userId) {
  const r = await fetchGuildMember(userId).catch(() => null);
  const m = r?.status === "ok" ? r.member : null;
  return String(m?.nick || m?.user?.global_name || m?.user?.username || "").trim();
}

// 📌 손으로 지급(POST /api/admin/goedam/grant { sid, userId }) — 완청 못 한 사람(기록이 빠진 사람 포함)에게 그 회차 장 수만큼.
//    봇 자동 지급과 같은 조건: 그 회차 줄을 { grantedAt: null } 조건부로 세운다(manual: true — 줄이 없으면 만든다) → 추첨권 Purchase N건(lib/goedamRules.js ticketPurchaseDocs).
//    이미 받았으면 거절. 추첨권을 못 넣으면 세운 표시를 되돌린다(다시 지급할 수 있게)
//    📌 2026-10-24 음성 날(sid "voice:<YYYY-MM-DD>")도 같은 길 — 지금 설정의 음성 장 수 · orderId "goedam:voice:<날짜>:<userId>" · adminNote 「괴담회 음성 N분 · M. D.」
//       (봇 음성 지급과 같은 주문 묶음이라 봇이 넣다 만 장 수를 두 번 넣지 않는다)
export async function grantGoedamTickets({ sid, userId, now = new Date() }) {
  const cfg = await loadGoedamConfig();
  const t = watchTargetOf(cfg, sid);
  if (!t) return refusal(404, "존재하지 않는 회차입니다.");
  const s = t.screening;
  if (!cfg.ticketItemId) return refusal(409, "추첨권 아이템이 지정되지 않았습니다.");
  const st = (await eventItemStates([cfg.ticketItemId])).get(cfg.ticketItemId)?.state;
  if (st !== "live") return refusal(409, "추첨권 아이템이 실사이트에 없습니다.");
  await ensureGoedamIndexes(GoedamWatch);
  const base = { eventKey: cfg.key, sid: t.sid, userId };
  const prev = await GoedamWatch.findOne(base, { _id: 0, userName: 1, grantedAt: 1 }).lean();
  if (prev?.grantedAt) return refusal(409, "이미 지급되었습니다.");
  const userName = prev?.userName || (await memberName(userId)) || userId;

  let row;
  try {
    row = await GoedamWatch.findOneAndUpdate(
      { ...base, grantedAt: null },
      { $set: { grantedAt: now, granted: t.tickets, manual: true, updatedAt: now }, $setOnInsert: { userName, seconds: 0 } },
      { upsert: true, returnDocument: "after" }
    ).lean();
  } catch (e) {
    if (isDup(e)) return refusal(409, "이미 지급되었습니다.");
    throw e;
  }
  // 📌 이미 들어간 장 수를 주문 묶음(orderId)으로 세어 모자란 만큼만 — 봇 fillTickets 와 같은 규칙(봇이 넣다 만 뒤 표시를 되돌린 줄에 두 번 주지 않게)
  let given = 0;
  try {
    const have = await Purchase.countDocuments({ userId, orderId: ticketOrderId(t.sid, userId) });
    given = Math.max(0, t.tickets - have);
    if (given > 0) await Purchase.insertMany(ticketPurchaseDocs({ cfg, screening: s, userId, userName: row?.userName || userName, n: given, now, note: t.note }));
  } catch (e) {
    await GoedamWatch.updateOne({ ...base, grantedAt: now, manual: true }, { $set: { grantedAt: null, granted: 0, manual: false } }).catch((err) =>
      console.error("[goedam] 수동 지급 표시 되돌리기 실패 — 수동 확인 필요", { ...base, err: err?.message })
    );
    throw e;
  }
  return { ok: true, row: rosterRow(row, t.judge), tickets: given };
}

// 📌 미지급 추첨 결과 다시 지급(POST /api/admin/goedam/grant { drawId }) — 지급이 실패해 granted false 로 남은 기록만.
//    granted 를 먼저 조건부로 세워(자물쇠) 두 번 주지 않는다. 실패하면 다시 false + error. 상품 내용은 지금 설정의 그 상품(지운 상품이면 거절), 양은 기록 스냅샷
export async function regrantGoedamDraw(drawId) {
  if (!mongoose.isValidObjectId(drawId)) return refusal(400, "요청이 올바르지 않습니다.");
  const cfg = await loadGoedamConfig();
  const d = await GoedamDraw.findOneAndUpdate({ _id: drawId, eventKey: cfg.key, granted: false }, { $set: { granted: true, error: "" } }, { returnDocument: "after" }).lean();
  if (!d) return refusal(409, "다시 지급할 기록이 없습니다.");
  const unlock = (error) =>
    GoedamDraw.updateOne({ _id: d._id, granted: true }, { $set: { granted: false, error } }).catch((e) =>
      console.error("[goedam] 다시 지급 표시 되돌리기 실패", { drawId: String(d._id), err: e?.message })
    );
  const cur = cfg.prizes.find((p) => p.pid === d.pid);
  if (!cur) {
    await unlock("상품을 찾을 수 없습니다");
    return refusal(404, "상품을 찾을 수 없습니다.");
  }
  const prize = { ...cur, kind: d.kind || cur.kind, amount: Number(d.amount) || cur.amount, count: Number(d.count) || cur.count };
  const label = labelOf(cfg, { ...prize, name: d.prizeName || cur.name });
  try {
    await grantGoedamPrize(d.userId, prize, label, d.userName || "", { ticketItemId: cfg.ticketItemId });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    await unlock(msg);
    return refusal(e?.code === NOT_LIVE ? 409 : 500, e?.code === NOT_LIVE ? "실사이트에 없는 아이템입니다." : "지급 중 오류가 발생했습니다.");
  }
  if (prize.kind === "point" && prize.amount > 0) {
    await logWallet({ userId: d.userId, currency: "point", amount: prize.amount, kind: GOEDAM_POINT_KIND, label, refId: `${cfg.key}:${d._id}` });
  }
  return { ok: true, draw: { id: String(d._id), granted: true, error: "" } };
}

// 📌 code 상품 코드 넣기 — GoedamCode 에 없는 것만(유니크 (eventKey, pid, code) — 이미 있는 코드 · 나간 코드는 그대로). 반환 넣은 수
export async function addGoedamCodes(pid, codes) {
  const list = [...new Set((Array.isArray(codes) ? codes : []).map((c) => String(c || "").trim()).filter(Boolean))];
  if (!pid || !list.length) return 0;
  await ensureGoedamIndexes(GoedamCode);
  const have = new Set((await GoedamCode.find({ eventKey: GOEDAM_KEY, pid, code: { $in: list } }, { _id: 0, code: 1 }).lean()).map((c) => c.code));
  const docs = list.filter((code) => !have.has(code)).map((code) => ({ eventKey: GOEDAM_KEY, pid, code, userId: null, drawId: "", at: null }));
  if (!docs.length) return 0;
  try {
    const r = await GoedamCode.insertMany(docs, { ordered: false });
    return r.length;
  } catch (e) {
    // 그 사이 같은 코드가 먼저 들어갔다 — 나머지는 들어갔다(ordered: false · insertedDocs 는 mongoose 가 붙인다)
    if (!isDup(e)) throw e;
    return Array.isArray(e?.insertedDocs) ? e.insertedDocs.length : 0;
  }
}

// 📌 설정 문서 쓰기 — 온 칸만 덮어쓴다($set). 문서가 없으면 만든다(첫 저장) — 그때 기간 · 제목 기본값을 같이(이미 $set 에 있는 칸은 빼고)
export async function writeGoedamConfig($set) {
  await ensureGoedamIndexes(Goedam);
  const defaults = {
    title: GOEDAM_DEFAULTS.title,
    drawOpensAt: new Date(GOEDAM_DEFAULTS.drawOpensAt),
    drawClosesAt: new Date(GOEDAM_DEFAULTS.drawClosesAt),
  };
  const $setOnInsert = Object.fromEntries(Object.entries(defaults).filter(([k]) => !(k in $set)));
  const doc = await Goedam.findOneAndUpdate(
    { key: GOEDAM_KEY },
    { $set, ...(Object.keys($setOnInsert).length ? { $setOnInsert } : {}) },
    { upsert: true, returnDocument: "after" }
  ).lean();
  return normalizeGoedamConfig(doc);
}
