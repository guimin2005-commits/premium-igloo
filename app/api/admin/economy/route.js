export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import XpLog from "@/models/XpLog";
import Payout from "@/models/Payout";
import Purchase from "@/models/Purchase";
import WalletLog from "@/models/WalletLog";
import UserXp from "@/models/UserXp";
import BotSetting from "@/models/BotSetting";
import { kstDaysStart, kstDateKey } from "@/lib/kst";
import {
  ECONOMY_PERIODS,
  xpLogPipeline,
  payoutPipeline,
  purchasePipeline,
  refundPipeline,
  walletPipeline,
  salesPipeline,
  dayKeys,
  buildDaily,
} from "@/lib/adminEconomy";

// 📌 관리자 재화 통계 — 기간 동안 XP · 빙옥 발행(들어옴) · 사용(나감) · 순증, 지금 유통량, 상품별 판매 (화면: app/admin/economy)
//    GET ?period=7d|30d|60d
//      → { period, since, floor, daily: [{ d, xp: { in, out, inBy, outBy }, point: {…} }], total: { xp, point },
//          circulation: { xp, point, users }, sales: [{ itemId, name, n, xp, point }] }
//    출처 분류는 원장(app/api/xp/ledger)과 같다 — 정의는 lib/adminEconomy.js.
//    📌 기간 시작이 내역 기준 시각(BotSetting.ledgerSince)보다 이르면 그 시각부터 센다(그 전 움직임은 원장에도 없다)
//    📌 기간마다 60초 동안 결과를 들고 있는다
const CACHE_MS = 60_000;
const cache = new Map(); // period → { at, data }

async function compute(period) {
  const start = kstDaysStart(ECONOMY_PERIODS[period]);
  const setting = await BotSetting.findOne({ key: "main" }, { ledgerSince: 1 }).lean();
  const floorAt = setting?.ledgerSince ? new Date(setting.ledgerSince) : null;
  const floor = floorAt && !Number.isNaN(floorAt.getTime()) ? floorAt : null;
  const since = floor && floor > start ? floor : start;

  const [xpLog, payout, purchase, refund, wallet, sales, circ] = await Promise.all([
    XpLog.aggregate(xpLogPipeline(since)).allowDiskUse(true),
    Payout.aggregate(payoutPipeline(since)),
    Purchase.aggregate(purchasePipeline(since)),
    Purchase.aggregate(refundPipeline(since)),
    WalletLog.aggregate(walletPipeline(since)),
    Purchase.aggregate(salesPipeline(since)),
    UserXp.aggregate([{ $group: { _id: null, xp: { $sum: "$xp" }, point: { $sum: "$point" }, users: { $sum: 1 } } }]),
  ]);

  const keys = dayKeys(kstDateKey(since), kstDateKey(new Date()));
  const { daily, total } = buildDaily([...xpLog, ...payout, ...purchase, ...refund, ...wallet], keys);
  const c = circ[0] || {};

  return {
    period,
    since: since.toISOString(),
    floor: floor ? floor.toISOString() : null,
    daily,
    total,
    circulation: { xp: c.xp || 0, point: c.point || 0, users: c.users || 0 },
    sales: sales.map((s) => ({ itemId: String(s._id ?? ""), name: s.name || "상품", n: s.n || 0, xp: s.xp || 0, point: s.point || 0 })),
  };
}

export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;

    const { searchParams } = new URL(request.url);
    const p = searchParams.get("period");
    const period = Object.hasOwn(ECONOMY_PERIODS, p) ? p : "7d";

    let hit = cache.get(period);
    if (!hit || Date.now() - hit.at > CACHE_MS) {
      await connectToDatabase();
      hit = { at: Date.now(), data: await compute(period) };
      cache.set(period, hit);
    }
    return NextResponse.json({ success: true, data: hit.data });
  } catch (e) {
    console.error("재화 통계 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
