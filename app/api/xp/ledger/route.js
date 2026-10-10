export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser } from "@/lib/apiAuth";
import { kstMonthStart } from "@/lib/kst";
import XpLog from "@/models/XpLog";
import Payout from "@/models/Payout";
import Purchase from "@/models/Purchase";
import WalletLog from "@/models/WalletLog";
import UserXp from "@/models/UserXp";
import BotSetting from "@/models/BotSetting";
import { stripAdminTag } from "@/lib/admins";

// 📌 XP · 빙옥 입출금 내역(원장) — 같은 움직임이 두 번 보이지 않게 출처를 나눈다 (계약서 5절)
//    XpLog     : 채팅 · 음성 · 출석 · 아이템 효과로 번 XP. KST 하루 · 사유별로 묶어 한 줄 (60일 TTL — 그 전 것은 없다)
//    Payout    : paid 만 — 운영진 지급 · 회수, 패스 · 퀘스트 XP 보상, 쿠폰 보상, 관리자 빙옥 지급(currency "point")
//    Purchase  : 상점 결제(−, createdAt) · 취소 · 환불(+, revokedAt → processedAt)
//    WalletLog : 위에 남지 않는 움직임만 — 강화 · 패스 해금 비용, 승급 · 퀘스트 · 패스 빙옥, 연속 출석 보너스 등
//    GET ?currency=xp|point&before=<ISO>&limit=50 → 최신순 [{ at, currency, amount, label, kind, count? }]
//        kind: XpLog 사유(chat · voice · attend · effect · effect-levelup) | payout-<source> | purchase · renew · cancel · refund | WalletLog kind
//    관리자는 ?userId= 로 남의 원장을 본다(관리자 유저 조회). 첫 쪽(before 없음)에만 이번 달 합계 · 잔액을 싣는다
//    📌 내역 기준 시각(BotSetting.ledgerSince) — 값이 있으면 그 시각 이전 움직임은 모든 출처에서 빼고, 이번 달 합계도 그 시각부터 센다.
//       기록은 지우지 않는다(구매는 보유 근거, WalletLog · Payout 은 퀘스트 셈에도 쓴다). 관리자 원본 목록(구매 · 지급 이력)은 이 값과 무관하다
//    📌 관리자 초기화(app/api/xp/grant mode reset)는 내역에 보이지 않는다 — Payout.kind "reset", 그 표시가 없던 예전 기록은 사유 "관리자 초기화…"
//    📌 지급 · 회수 사유 끝의 관리자 이름(" (elahw.06)" — 예전 기본 사유)은 떼고 보인다(lib/admins.js stripAdminTag)
const XPLOG_DAYS = 60; // models/XpLog.js TTL 과 같아야 한다
const MAX_LIMIT = 100;
const KST = 9 * 60 * 60 * 1000;

const XP_REASON = {
  chat: "채팅",
  voice: "음성",
  attend: "출석",
  effect: "아이템 효과",
  "effect-levelup": "레벨업 효과",
};
const PAYOUT_SOURCE = {
  manual: "운영진 지급",
  admin: "운영진 지급",
  quest: "퀘스트 보상",
  pass: "시즌 패스 보상",
  code: "쿠폰 보상",
  supporter: "서포터즈 보상",
  referral: "초대 보상",
  // 📌 관리자 역할 이전의 환불(app/api/admin/role-migration) — 사유 "역할 환불 · <역할>"이 줄 이름이다. 표시 기록(Purchase)은 낸 값 0 이라 줄이 없다
  "role-refund": "역할 환불",
};

// 날짜의 KST 다음 날 00:00 (UTC Date) — 그날 하루치 XpLog 를 통째로 묶기 위한 상한
const nextKstDay = (d) => {
  const k = new Date(d.getTime() + KST);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + 1) - KST);
};
const range = (lt, gte) => {
  const r = {};
  if (lt) r.$lt = lt;
  if (gte) r.$gte = gte;
  return Object.keys(r).length ? r : null;
};

// 📌 상점 결제에서 실제로 빠진 값 — 주문 취소 · 환불(app/api/shop/orders)이 돌려주는 식과 같다.
//    나눠 적은 값(paidXp/paidPoint)이 있으면 그 값, 옛 기록(나눔 없음)은 정가를 XP 로 낸 것으로 본다
const hasSplit = {
  $or: [
    { $eq: ["$billed", true] },
    { $gt: [{ $ifNull: ["$paidXp", 0] }, 0] },
    { $gt: [{ $ifNull: ["$paidPoint", 0] }, 0] },
  ],
};
const paidOf = (currency) =>
  currency === "point"
    ? { $cond: [hasSplit, { $ifNull: ["$paidPoint", 0] }, 0] }
    : { $cond: [hasSplit, { $ifNull: ["$paidXp", 0] }, { $ifNull: ["$price", 0] }] };

// ── 출처별 조회 — { before(상한, 미포함), since(하한), limit(0 이면 전부) } ──

// XpLog — 하루 · 사유별 한 줄. 줄의 시각은 그 묶음의 마지막 적립 시각이다.
//    📌 쪽 넘김(before)이 하루 중간에 걸려도 묶음이 쪼개지지 않게, 행이 아니라 묶음의 시각으로 자른다
//       (그날 행은 전부 모아 묶은 뒤 at < before 만 남긴다 — 앞 쪽에 나온 묶음은 at ≥ before 라 다시 나오지 않는다)
async function xpLogRows(userId, { before, since, limit }) {
  const createdAt = range(before && nextKstDay(before), since);
  const pipe = [
    { $match: { userId, ...(createdAt ? { createdAt } : {}) } },
    {
      $group: {
        _id: { d: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+09:00" } }, r: "$reason" },
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
        at: { $max: "$createdAt" },
      },
    },
    { $match: { amount: { $ne: 0 }, ...(before ? { at: { $lt: before } } : {}) } },
    { $sort: { at: -1 } },
  ];
  if (limit) pipe.push({ $limit: limit });
  const rows = await XpLog.aggregate(pipe);
  return rows.map((r) => ({
    at: r.at,
    currency: "xp",
    amount: r.amount,
    label: XP_REASON[r._id.r] || "기타 적립",
    kind: r._id.r || "etc",
    count: r.count,
  }));
}

// 📌 관리자 초기화 기록 — 내역에 보이지 않는다. 새 기록은 kind "reset"(사유를 바꿔 적어도 가려진다),
//    그 표시가 없던 예전 기록(실사이트 옛 코드가 남긴 것 포함)은 수동 지급 중 사유가 "관리자 초기화" 로 시작하는 것
const HIDDEN_PAYOUT = [{ kind: "reset" }, { source: "manual", reason: /^관리자 초기화/ }];

// Payout — 실제로 반영된(paid) 것만. 대기 · 처리 중은 아직 움직이지 않았다
async function payoutRows(userId, currency, { before, since, limit }) {
  const at = range(before, since);
  const pipe = [
    {
      $match: {
        userId,
        status: "paid",
        currency: currency === "point" ? "point" : { $ne: "point" },
        amount: { $ne: 0 },
        $nor: HIDDEN_PAYOUT,
      },
    },
    { $addFields: { at: { $ifNull: ["$paidAt", "$createdAt"] } } },
    ...(at ? [{ $match: { at } }] : []),
    { $sort: { at: -1 } },
  ];
  if (limit) pipe.push({ $limit: limit });
  pipe.push({ $project: { at: 1, amount: 1, reason: 1, source: 1 } });
  const rows = await Payout.aggregate(pipe);
  return rows.map((r) => {
    const source = r.source || "etc";
    const fallback = source === "manual" && r.amount < 0 ? "운영진 회수" : PAYOUT_SOURCE[source] || "지급";
    return {
      at: r.at,
      currency,
      amount: r.amount,
      // 예전 기본 사유("관리자 지급 (elahw.06)")의 관리자 이름은 떼고 보인다
      label: stripAdminTag(String(r.reason || "").trim()) || fallback,
      kind: `payout-${source}`,
    };
  });
}

// 📌 세트 주문(lib/bundle.js — 구성마다 한 건, 같은 orderId · 같은 세트 상품)은 세트 이름(bundleName)만 — 구성 이름 · 기간 · 개수를 붙이지 않는다
const itemLabel = (p) =>
  p.bundleName ? p.bundleName : `${p.itemName || "상품"}${p.days > 0 ? ` (${p.days}일)` : ""}${p.n > 1 ? ` ×${p.n}` : ""}`;

// 📌 주문 묶음 키 — 1개 단위 상품은 1개가 한 건이라, 한 결제(orderId)의 같은 상품은 한 줄로 묶는다(lib/orderGroups.js 와 같은 기준).
//    orderId 가 없는 옛 건은 건마다 한 줄. extra: 묶음을 더 나눌 값(환불은 처리 시각까지 같아야 한 줄)
const orderKey = (extra = {}) => ({
  $cond: [
    { $gt: [{ $ifNull: ["$orderId", ""] }, ""] },
    { o: "$orderId", i: "$itemId", ...extra },
    { p: "$_id" },
  ],
});

// Purchase 결제 — 낸 값이 있는 건만 (시즌 패스 · 관리자 지급 아이템은 0 이라 빠진다). 한 주문의 같은 상품은 한 줄(합계 · ×N).
//    📌 한 결제의 건은 createdAt 이 같다(app/api/shop/checkout) — 쪽 넘김(at < before)으로 한 주문이 갈라지지 않는다
async function purchaseRows(userId, currency, { before, since, limit }) {
  const createdAt = range(before, since);
  const pipe = [
    { $match: { userId, ...(createdAt ? { createdAt } : {}) } },
    { $addFields: { amt: paidOf(currency) } },
    // 📌 묶은 뒤에 거른다 — ×N 은 산 개수 전부(이 화폐 몫이 0 인 건 — 빙옥을 조금만 쓴 주문의 나머지 건 등 — 도 센다)
    {
      $group: {
        _id: orderKey(),
        createdAt: { $max: "$createdAt" },
        amt: { $sum: "$amt" },
        n: { $sum: 1 },
        itemName: { $first: "$itemName" },
        days: { $first: "$days" },
        renewOf: { $first: "$renewOf" },
        bundleName: { $max: "$bundleName" },
      },
    },
    { $match: { amt: { $gt: 0 } } },
    { $sort: { createdAt: -1 } },
  ];
  if (limit) pipe.push({ $limit: limit });
  const rows = await Purchase.aggregate(pipe);
  return rows.map((p) => {
    // 세트는 구성 하나가 연장이어도 세트 구매 한 줄
    const renew = !!p.renewOf && !p.bundleName;
    return {
      at: p.createdAt,
      currency,
      amount: -p.amt,
      label: `${renew ? "연장" : "구매"} · ${itemLabel(p)}`,
      kind: renew ? "renew" : "purchase",
    };
  });
}

// Purchase 취소 · 환불 — 결제 때 낸 값을 그대로 돌려받았다.
//    📌 관리자 테스트 초기화(app/api/xp/reset)는 실제로 빠진 건(billed)만 돌려주므로 나머지는 뺀다
async function refundRows(userId, currency, { before, since, limit }) {
  const at = range(before, since);
  const pipe = [
    { $match: { userId, status: { $in: ["cancelled", "refunded"] } } },
    {
      $addFields: {
        at: { $ifNull: ["$revokedAt", { $ifNull: ["$processedAt", "$createdAt"] }] },
        amt: paidOf(currency),
      },
    },
    {
      $match: {
        ...(at ? { at } : {}),
        $nor: [{ adminNote: "관리자 테스트 초기화", billed: { $ne: true } }],
      },
    },
    // 한 요청으로 돌려준 같은 주문 · 같은 상품은 한 줄 — 관리자 주문 처리(app/api/shop/orders)가 처리 시각을 하나로 적는다.
    //    구매 줄처럼 묶은 뒤에 거른다(×N 은 돌려준 개수 전부)
    {
      $group: {
        _id: orderKey({ s: "$status", t: "$at" }),
        at: { $max: "$at" },
        amt: { $sum: "$amt" },
        n: { $sum: 1 },
        status: { $first: "$status" },
        itemName: { $first: "$itemName" },
        days: { $first: "$days" },
        bundleName: { $max: "$bundleName" },
      },
    },
    { $match: { amt: { $gt: 0 } } },
    { $sort: { at: -1 } },
  ];
  if (limit) pipe.push({ $limit: limit });
  const rows = await Purchase.aggregate(pipe);
  return rows.map((p) => ({
    at: p.at,
    currency,
    amount: p.amt,
    label: `${p.status === "refunded" ? "환불" : "취소"} · ${itemLabel(p)}`,
    kind: p.status === "refunded" ? "refund" : "cancel",
  }));
}

// WalletLog — 다른 기록에 남지 않는 움직임
async function walletRows(userId, currency, { before, since, limit }) {
  const createdAt = range(before, since);
  let q = WalletLog.find(
    { userId, currency: currency === "point" ? "point" : { $ne: "point" }, amount: { $ne: 0 }, ...(createdAt ? { createdAt } : {}) },
    { createdAt: 1, amount: 1, label: 1, kind: 1 }
  ).sort({ createdAt: -1 });
  if (limit) q = q.limit(limit);
  const rows = await q.lean();
  return rows.map((w) => ({
    at: w.createdAt,
    currency,
    amount: w.amount,
    label: w.label || "기타",
    kind: w.kind || "etc",
  }));
}

const fetchAll = (userId, currency, opts) =>
  Promise.all([
    currency === "xp" ? xpLogRows(userId, opts) : Promise.resolve([]),
    payoutRows(userId, currency, opts),
    purchaseRows(userId, currency, opts),
    refundRows(userId, currency, opts),
    walletRows(userId, currency, opts),
  ]).then((lists) => lists.flat());

export async function GET(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;

    const { searchParams } = new URL(request.url);
    const currency = searchParams.get("currency") === "point" ? "point" : "xp";
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(searchParams.get("limit")) || 50)));
    const beforeRaw = searchParams.get("before");
    const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
    const before = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;

    // 본인 원장이 기본. 남의 원장(?userId=)은 관리자만
    const asked = String(searchParams.get("userId") || "").trim();
    if (asked && asked !== auth.userId && !auth.isAdmin) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    if (asked && !/^\d{5,25}$/.test(asked)) {
      return NextResponse.json({ success: false, error: "잘못된 유저 ID입니다." }, { status: 400 });
    }
    const userId = asked || auth.userId;
    if (!userId) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();

    // 📌 내역 기준 시각 — 값이 있으면 그 시각 이전 움직임은 어느 쪽에서도 보이지 않는다(이번 달 합계 포함)
    const setting = await BotSetting.findOne({ key: "main" }, { ledgerSince: 1 }).lean();
    const floorAt = setting?.ledgerSince ? new Date(setting.ledgerSince) : null;
    const floor = floorAt && !Number.isNaN(floorAt.getTime()) ? floorAt : null;

    // 출처마다 limit+1 개씩 받아 합친 뒤 자른다 — 전체 상위 limit 개가 반드시 이 안에 있다
    const first = !before;
    const monthStart = kstMonthStart();
    const since = floor && floor > monthStart ? floor : monthStart;
    const [all, monthRows, wallet] = await Promise.all([
      fetchAll(userId, currency, { before, since: floor, limit: limit + 1 }),
      // 이번 달 합계는 첫 쪽에서만 — 더 보기마다 다시 셀 필요가 없다 (한 달치 묶음 · 기록이라 양이 작다)
      first ? fetchAll(userId, currency, { since, limit: 0 }) : Promise.resolve(null),
      first ? UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean() : Promise.resolve(null),
    ]);

    // 같은 시각이면 종류 순으로 — 쪽마다 순서가 흔들리지 않게
    all.sort((a, b) => b.at - a.at || String(a.kind).localeCompare(String(b.kind)));
    const items = all.slice(0, limit);
    // 📌 자른 자리와 같은 시각인 줄은 이번 쪽에 함께 싣는다 — 다음 쪽은 at < before 로 받으므로
    //    같은 순간에 들어간 건(장바구니 여러 개 등)이 쪽 경계에서 빠지지 않게
    if (all.length > limit) {
      const edge = items[items.length - 1].at.getTime();
      for (let i = limit; i < all.length && all[i].at.getTime() === edge; i++) items.push(all[i]);
    }
    const hasMore = all.length > items.length;

    let month = null;
    if (monthRows) {
      let plus = 0;
      let minus = 0;
      for (const r of monthRows) {
        if (r.amount > 0) plus += r.amount;
        else minus += r.amount;
      }
      month = { since: since.toISOString(), plus, minus };
    }

    return NextResponse.json({
      success: true,
      data: {
        userId,
        currency,
        items: items.map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
        hasMore,
        nextBefore: hasMore ? new Date(items[items.length - 1].at).toISOString() : null,
        month, // { since(이번 달 1일 · 내역 기준 시각 중 늦은 쪽), plus, minus(음수) } — 첫 쪽에만
        balance: wallet ? { xp: wallet.xp || 0, point: wallet.point || 0 } : first ? { xp: 0, point: 0 } : null,
        retentionDays: XPLOG_DAYS, // 채팅 · 음성 · 출석 XP 는 이 기간만 남는다 (XP 쪽 안내용)
      },
    });
  } catch (e) {
    console.error("원장 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
