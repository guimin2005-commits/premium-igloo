export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import Purchase from "@/models/Purchase";
import mongoose from "mongoose";
import { settleOrders } from "@/lib/orderRefund";

// ── [조회] 전체 구매 내역 (관리자) ──
export async function GET(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    const status = sp.get("status");
    const filter = status && ["pending", "completed", "cancelled", "refunded"].includes(status) ? { status } : {};

    // 📌 1개 단위 상품은 1개가 한 건이라 건 수가 빨리 는다 — 화면이 주문(orderId + 상품)으로 묶어 보여 주므로 넉넉히 읽는다
    const [rows, pendingCount] = await Promise.all([
      Purchase.find(filter).sort({ createdAt: -1 }).limit(500).lean(),
      Purchase.countDocuments({ status: "pending" }),
    ]);
    return NextResponse.json({ success: true, data: rows, pendingCount });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [처리] 발송 완료 / 취소(환불) (관리자) ──
//    { id } 한 건 또는 { ids: [...] } 여러 건(최대 99) — 1개 단위 상품은 1개가 한 건이라 관리자 주문 목록이
//    한 줄(orderId + 상품)의 건들을 골라 한 번에 보낸다. 건마다 아래 처리를 그대로 돌린다(조건부 상태 전환 → 환불 → 캐시백 회수 → 재고).
//    📌 한 요청으로 처리한 건은 processedAt · revokedAt 이 모두 같다 — 원장(app/api/xp/ledger)이 같은 주문 · 같은 시각끼리 한 줄로 묶는다
//    📌 이미 쓴 건(consumedAt — 쓴 소모권 · 보호막)은 취소 · 환불하지 않는다. 예외가 필요하면 XP 수동 지급으로 돌려준다
//    응답: { success, data: 처리한 첫 건(옛 화면용), done: 처리 수, skipped: 건너뛴 수(이미 처리 · 이미 사용) }
const MAX_IDS = 99;

export async function PATCH(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { id, ids, status, adminNote } = await request.json();
    const list = [...new Set((Array.isArray(ids) ? ids : id ? [id] : []).map((v) => String(v || "")))]
      .filter((v) => mongoose.isValidObjectId(v))
      .slice(0, MAX_IDS);
    if (!list.length || !["completed", "cancelled", "refunded"].includes(status)) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    // 📌 상태 전환 · 낸 값 반환 · 캐시백 회수 · 재고 · 레벨 재계산은 lib/orderRefund.js settleOrders —
    //    관리자 유저 조회 인벤토리 회수(app/api/admin/users/inventory)의 상점 구매 건도 같은 함수를 쓴다
    const at = new Date();
    const { done, fromStatus, giveBack } = await settleOrders({ ids: list, status, adminNote, at });

    if (!done.length) {
      // 하나도 못 했으면 이유를 가른다 — 이미 쓴 건이 섞였으면 그 이유를 먼저
      const used = giveBack ? await Purchase.exists({ _id: { $in: list }, status: fromStatus, consumedAt: { $ne: null } }) : null;
      return NextResponse.json({ success: false, message: used ? "이미 사용한 상품입니다." : "이미 처리된 구매입니다." }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: done[0], done: done.length, skipped: list.length - done.length });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
