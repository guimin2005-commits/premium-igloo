// 📌 관리자 재화 통계(app/api/admin/economy) 집계 — 기간 동안 XP · 빙옥이 어디서 생기고 어디로 빠졌는지.
//    모델 · 별칭(@/) import 없는 순수 파이프라인이다 — 라우트와 읽기 스크립트가 같은 식을 그대로 돌린다.
//
//    📌 출처 분류는 원장(app/api/xp/ledger/route.js)과 같다 — 같은 움직임이 두 곳에서 세어지지 않는다.
//       XpLog     : 채팅 · 음성 · 출석 · 아이템 효과 · 레벨업 효과 (XP 만)
//       Payout    : paid 만 — 운영진 지급 · 회수, 퀘스트 · 패스 · 쿠폰 · 서포터즈 · 초대 보상, 역할 환불. 시각은 paidAt(없으면 createdAt)
//                   관리자 초기화(kind "reset" · 옛 "관리자 초기화…" 사유)는 원장처럼 뺀다
//       Purchase  : 상점 결제(−, createdAt) · 취소 · 환불(+, revokedAt → processedAt → createdAt). 낸 값은 paidXp/paidPoint(옛 건은 정가를 XP 로)
//                   관리자 테스트 초기화로 돌려준 건 중 실제로 빠지지 않은(billed 아님) 건은 뺀다
//       WalletLog : 위에 남지 않는 움직임 — 강화 · 패스 해금 비용, 캐시백, 승급 · 퀘스트 · 패스 빙옥, 연속 출석 보너스 등
//       내역 기준 시각(BotSetting.ledgerSince) 이전 움직임은 모든 출처에서 뺀다(원장과 같음)
//    ⚠ 위 식(HIDDEN_PAYOUT · hasSplit · paidOf · 테스트 초기화 제외)을 원장에서 바꾸면 여기도 같이 바꾼다
//
//    각 파이프라인은 [{ _id: { d: "YYYY-MM-DD"(KST), c: "xp"|"point", k: 분류 키, pos: true|false }, v: 부호 있는 합 }] 를 낸다.
//    pos 로 들어옴(+) · 나감(−)을 가른다 — 운영진 지급(+)과 회수(−)처럼 한 분류가 양쪽에 다 있을 수 있다.

export const ECONOMY_PERIODS = { "7d": 7, "30d": 30, "60d": 60 }; // KST 날짜 경계, 오늘 포함 N일 (XpLog TTL 60일)
export const SALES_LIMIT = 100;

const dayOf = (field) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: "+09:00" } });

// 원장과 같은 식 ─────────────────────────────────────────────
const HIDDEN_PAYOUT = [{ kind: "reset" }, { source: "manual", reason: /^관리자 초기화/ }];
const hasSplit = {
  $or: [
    { $eq: ["$billed", true] },
    { $gt: [{ $ifNull: ["$paidXp", 0] }, 0] },
    { $gt: [{ $ifNull: ["$paidPoint", 0] }, 0] },
  ],
};
const paidXp = { $cond: [hasSplit, { $ifNull: ["$paidXp", 0] }, { $ifNull: ["$price", 0] }] };
const paidPoint = { $cond: [hasSplit, { $ifNull: ["$paidPoint", 0] }, 0] };
const TEST_RESET = { adminNote: "관리자 테스트 초기화", billed: { $ne: true } };

// XpLog — 사유가 분류 키
export const xpLogPipeline = (since) => [
  { $match: { createdAt: { $gte: since }, amount: { $ne: 0 } } },
  { $group: { _id: { d: dayOf("$createdAt"), c: "xp", k: { $ifNull: ["$reason", "etc"] }, pos: { $gt: ["$amount", 0] } }, v: { $sum: "$amount" } } },
];

// Payout — "payout-<source>". 화폐는 currency "point" 만 빙옥, 나머지(빈 값 포함)는 XP
export const payoutPipeline = (since) => [
  { $match: { status: "paid", amount: { $ne: 0 }, $nor: HIDDEN_PAYOUT } },
  { $addFields: { at: { $ifNull: ["$paidAt", "$createdAt"] } } },
  { $match: { at: { $gte: since } } },
  {
    $group: {
      _id: {
        d: dayOf("$at"),
        c: { $cond: [{ $eq: ["$currency", "point"] }, "point", "xp"] },
        k: { $concat: ["payout-", { $ifNull: ["$source", "etc"] }] },
        pos: { $gt: ["$amount", 0] },
      },
      v: { $sum: "$amount" },
    },
  },
];

// Purchase 결제 — 상점 결제(새 구매) · 연장. 낸 값이 0 인 건(시즌 패스 · 관리자 지급 아이템)은 합에 0 이라 빠진다
export const purchasePipeline = (since) => [
  { $match: { createdAt: { $gte: since } } },
  { $project: { d: dayOf("$createdAt"), k: { $cond: [{ $gt: [{ $ifNull: ["$renewOf", ""] }, ""] }, "renew", "purchase"] }, x: paidXp, p: paidPoint } },
  {
    $facet: {
      xp: [{ $match: { x: { $gt: 0 } } }, { $group: { _id: { d: "$d", c: "xp", k: "$k", pos: { $literal: false } }, v: { $sum: { $multiply: ["$x", -1] } } } }],
      point: [{ $match: { p: { $gt: 0 } } }, { $group: { _id: { d: "$d", c: "point", k: "$k", pos: { $literal: false } }, v: { $sum: { $multiply: ["$p", -1] } } } }],
    },
  },
  { $project: { all: { $concatArrays: ["$xp", "$point"] } } },
  { $unwind: "$all" },
  { $replaceRoot: { newRoot: "$all" } },
];

// Purchase 취소 · 환불 — 결제 때 낸 값을 그대로 돌려받았다
export const refundPipeline = (since) => [
  { $match: { status: { $in: ["cancelled", "refunded"] }, $nor: [TEST_RESET] } },
  {
    $project: {
      at: { $ifNull: ["$revokedAt", { $ifNull: ["$processedAt", "$createdAt"] }] },
      k: { $cond: [{ $eq: ["$status", "refunded"] }, "refund", "cancel"] },
      x: paidXp,
      p: paidPoint,
    },
  },
  { $match: { at: { $gte: since } } },
  {
    $facet: {
      xp: [{ $match: { x: { $gt: 0 } } }, { $group: { _id: { d: dayOf("$at"), c: "xp", k: "$k", pos: { $literal: true } }, v: { $sum: "$x" } } }],
      point: [{ $match: { p: { $gt: 0 } } }, { $group: { _id: { d: dayOf("$at"), c: "point", k: "$k", pos: { $literal: true } }, v: { $sum: "$p" } } }],
    },
  },
  { $project: { all: { $concatArrays: ["$xp", "$point"] } } },
  { $unwind: "$all" },
  { $replaceRoot: { newRoot: "$all" } },
];

// WalletLog — kind 가 분류 키
export const walletPipeline = (since) => [
  { $match: { createdAt: { $gte: since }, amount: { $ne: 0 } } },
  {
    $group: {
      _id: {
        d: dayOf("$createdAt"),
        c: { $cond: [{ $eq: ["$currency", "point"] }, "point", "xp"] },
        k: { $ifNull: ["$kind", "etc"] },
        pos: { $gt: ["$amount", 0] },
      },
      v: { $sum: "$amount" },
    },
  },
];

// 기간 상품별 판매 — 결제한 건(낸 값이 있는 건)만, 취소 · 환불된 건은 뺀다. 건수는 문서 수(1개 단위 상품은 1개가 한 건)
export const salesPipeline = (since) => [
  { $match: { createdAt: { $gte: since }, status: { $nin: ["cancelled", "refunded"] } } },
  { $project: { itemId: 1, itemName: 1, createdAt: 1, x: paidXp, p: paidPoint } },
  { $match: { $or: [{ x: { $gt: 0 } }, { p: { $gt: 0 } }] } },
  { $sort: { createdAt: 1 } },
  { $group: { _id: "$itemId", n: { $sum: 1 }, xp: { $sum: "$x" }, point: { $sum: "$p" }, name: { $last: "$itemName" } } },
  { $sort: { n: -1, xp: -1, point: -1 } },
  { $limit: SALES_LIMIT },
];

// ── 분류 이름 ── 키 → [들어옴 이름, 나감 이름]. 원장 줄 이름(XP_REASON · PAYOUT_SOURCE)을 따른다
const XP_LABEL = {
  voice: ["음성"],
  chat: ["채팅"],
  attend: ["출석"],
  effect: ["아이템 효과"],
  "effect-levelup": ["레벨업 효과"],
  "payout-manual": ["운영진 지급", "운영진 회수"],
  "payout-quest": ["퀘스트 보상"],
  "payout-pass": ["시즌 패스 보상"],
  "payout-code": ["쿠폰 보상"],
  "payout-supporter": ["서포터즈 보상"],
  "payout-referral": ["초대 보상"],
  "payout-role-refund": ["역할 환불"],
  purchase: [null, "상점 결제"],
  renew: [null, "상점 연장"],
  refund: ["상점 환불"],
  cancel: ["주문 취소"],
  enhance: ["강화 초기화 환불", "강화"],
  "pass-unlock": ["패스 초기화 환불", "패스 해금"],
  cashback: ["캐시백", "캐시백 회수"],
  streak: ["연속 출석 보너스"],
};
const POINT_LABEL = {
  "payout-manual": ["운영진 지급", "운영진 회수"],
  "payout-role-refund": ["역할 환불"],
  "payout-supporter": ["서포터즈 보상"],
  "pass-point": ["시즌 패스 보상"],
  "quest-point": ["퀘스트 보상"],
  "tier-point": ["승급 보상"],
  "attend-point": ["출석 보상"],
  streak: ["연속 출석 보너스"],
  admin: ["서포터즈 보상"], // app/api/admin/supporters/pay 의 빙옥(WalletLog kind "admin")
  purchase: [null, "상점 결제"],
  renew: [null, "상점 연장"],
  refund: ["상점 환불"],
  cancel: ["주문 취소"],
  enhance: ["강화 초기화 환불", "강화"],
  "pass-unlock": ["패스 초기화 환불", "패스 해금"],
};
// 같은 뜻의 다른 키 — 원장도 manual · admin 을 같은 "운영진 지급"으로 보인다
const ALIAS = { "payout-admin": "payout-manual" };
// 이름이 같은 키는 한 줄로 — 서포터즈 빙옥은 Payout(옛) · WalletLog 두 갈래로 남았다
const labelOf = (c, k, pos) => {
  const pair = (c === "point" ? POINT_LABEL : XP_LABEL)[k];
  return (pair && (pos ? pair[0] : pair[1] || pair[0])) || `기타 · ${k}`;
};

// 하루 · 화폐 · 방향마다 { 이름: 합(양수) }. 나감은 양수로 바꿔 담는다
const emptyDay = (d) => ({ d, xp: { in: {}, out: {} }, point: { in: {}, out: {} } });

// KST 날짜 글자 목록 — from 부터 to 까지(둘 다 "YYYY-MM-DD")
export function dayKeys(from, to) {
  const out = [];
  const t = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (; t <= end; t.setUTCDate(t.getUTCDate() + 1)) out.push(t.toISOString().slice(0, 10));
  return out;
}

const toList = (m) =>
  Object.entries(m)
    .map(([l, v]) => ({ l, v }))
    .filter((x) => x.v !== 0)
    .sort((a, b) => b.v - a.v || a.l.localeCompare(b.l));
const sumOf = (m) => Object.values(m).reduce((s, v) => s + v, 0);

// 출처별 결과를 날짜 줄로. rows: 위 파이프라인 결과를 이어 붙인 것, keys: dayKeys(…)
export function buildDaily(rows, keys) {
  const days = new Map(keys.map((d) => [d, emptyDay(d)]));
  const total = emptyDay("total");
  for (const r of rows) {
    const id = r?._id;
    if (!id || !r.v) continue;
    const day = days.get(id.d);
    if (!day) continue; // 기간 밖(경계 시각 차이) — 버린다
    const c = id.c === "point" ? "point" : "xp";
    const k = ALIAS[id.k] || id.k || "etc";
    const pos = r.v > 0;
    const side = pos ? "in" : "out";
    const l = labelOf(c, k, pos);
    const v = Math.abs(r.v);
    day[c][side][l] = (day[c][side][l] || 0) + v;
    total[c][side][l] = (total[c][side][l] || 0) + v;
  }
  const shape = (x) => ({
    in: sumOf(x.in),
    out: sumOf(x.out),
    inBy: toList(x.in),
    outBy: toList(x.out),
  });
  return {
    daily: keys.map((d) => {
      const day = days.get(d);
      return { d, xp: shape(day.xp), point: shape(day.point) };
    }),
    total: { xp: shape(total.xp), point: shape(total.point) },
  };
}
