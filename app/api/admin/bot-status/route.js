export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import BotStatus from "@/models/BotStatus";
import Payout from "@/models/Payout";
import Purchase from "@/models/Purchase";
import CodeGrant from "@/models/CodeGrant";
import UserXp from "@/models/UserXp";
import BotMessageTest from "@/models/BotMessageTest";

// 📌 봇 상태 — 생존 신호(BotStatus, 봇 heartbeat 가 찍는다) + 봇이 처리해야 할 대기 건수.
//    대시보드가 "꺼져 있는데 쌓이고 있다"를 한눈에 보게 한다. 조건은 봇 대기열(bot/src/features/grantQueue.js)이 집는 것과 같게.
const ONLINE_MS = 90_000; // 이 안에 신호가 있으면 작동 중
const BOT_ITEM_TYPES = ["role", "perk", "item", "cosmetic"]; // 봇이 역할로 지급 · 회수하는 상품(실물은 관리자가 발송)

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();

    const now = new Date();
    const [status, payout, purchase, codeGrant, roleSync, refund, expired, messageTest] = await Promise.all([
      BotStatus.findOne({ key: "main" }).lean(),
      // 빙옥 건은 사이트가 즉시 반영한 기록이라 봇이 집지 않는다. processing 은 봇이 선점한 채 멈춘 건까지 센다
      Payout.countDocuments({ status: { $in: ["pending", "processing"] }, currency: { $ne: "point" } }),
      Purchase.countDocuments({ status: "pending", itemType: { $in: BOT_ITEM_TYPES } }),
      CodeGrant.countDocuments({ status: "pending" }),
      UserXp.countDocuments({ needsRoleSync: true }),
      Purchase.countDocuments({ status: "refunded", roleDetached: { $ne: true } }),
      Purchase.countDocuments({ status: "completed", itemType: { $in: BOT_ITEM_TYPES }, expiresAt: { $ne: null, $lte: now } }),
      BotMessageTest.countDocuments({ status: "pending" }),
    ]);

    const lastSeen = status?.lastSeen ? new Date(status.lastSeen) : null;
    // 경과 시간은 서버 시계로 — 관리자 PC 시계가 틀려도 "몇 분 전"이 맞게
    const agoSec = lastSeen ? Math.max(0, Math.floor((now.getTime() - lastSeen.getTime()) / 1000)) : null;
    const pending = { payout, purchase, codeGrant, roleSync, refund, expired, messageTest };

    return NextResponse.json({
      success: true,
      data: {
        online: agoSec != null && agoSec * 1000 <= ONLINE_MS,
        lastSeen,
        agoSec,
        startedAt: status?.startedAt || null,
        version: status?.version || "",
        lastError: status?.lastError || "",
        lastErrorAt: status?.lastErrorAt || null,
        pending,
        pendingTotal: Object.values(pending).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    console.error("봇 상태 조회 실패:", error);
    return NextResponse.json({ success: false, message: "봇 상태를 불러오지 못했습니다.", error: "봇 상태를 불러오지 못했습니다." }, { status: 500 });
  }
}
