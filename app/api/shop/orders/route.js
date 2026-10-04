export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import Purchase from "@/models/Purchase";
import mongoose from "mongoose";
import { settleOrders } from "@/lib/orderRefund";

// 📌 쪽 넘김(더 보기) — 최신순(createdAt · _id 내림차순)으로 limit 건씩. before 는 앞 쪽 응답의 next("<시각 ms>_<_id>") — 그보다 오래된 것부터.
//    limit 기본 500(예전 한 번에 읽던 양) · 최대 5,000(처리 뒤 화면이 '더 보기'로 펼친 깊이만큼 다시 읽을 때)
//    📌 쪽 끝에 걸친 주문(같은 orderId)은 나머지 건까지 같은 쪽에 붙인다 — 1개 단위 주문이 두 쪽으로 갈려 일부만 묶여 보이고 일부만 환불되지 않게.
//       next 는 붙이기 전 쪽 끝 기준이라 붙인 건이 다음 쪽에 또 올 수 있다 — 화면이 _id 로 겹친 건을 뺀다(사이에 낀 다른 건을 건너뛰지 않게)
const PAGE = 500;
const PAGE_MAX = 5000;
const parseCursor = (v) => {
  const m = /^(\d{1,15})_([a-f0-9]{24})$/i.exec(String(v || ""));
  return m ? { at: new Date(Number(m[1])), id: new mongoose.Types.ObjectId(m[2]) } : null;
};
const cursorOf = (r) => `${new Date(r.createdAt || 0).getTime()}_${r._id}`;
const olderThan = (c) => ({ $or: [{ createdAt: { $lt: c.at } }, { createdAt: c.at, _id: { $lt: c.id } }] });

// ── [조회] 전체 구매 내역 (관리자) ──
//    응답: { data, pendingCount, hasMore, next } — hasMore 면 next 를 before 로 넘겨 다음 쪽
export async function GET(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    const status = sp.get("status");
    const filter = status && ["pending", "completed", "cancelled", "refunded"].includes(status) ? { status } : {};
    const limit = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(sp.get("limit")) || PAGE)));
    const before = parseCursor(sp.get("before"));
    const page = before ? { $and: [filter, olderThan(before)] } : filter;

    // 📌 1개 단위 상품은 1개가 한 건이라 건 수가 빨리 는다 — 화면이 주문(orderId + 상품)으로 묶어 보여 주므로 넉넉히 읽는다
    const [got, pendingCount] = await Promise.all([
      Purchase.find(page).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean(),
      Purchase.countDocuments({ status: "pending" }),
    ]);
    const hasMore = got.length > limit;
    const rows = got.slice(0, limit);
    const tail = rows[rows.length - 1];
    if (hasMore && tail?.orderId) {
      const rest = await Purchase.find({ $and: [filter, { userId: tail.userId, orderId: tail.orderId }, olderThan({ at: new Date(tail.createdAt || 0), id: tail._id })] })
        .sort({ createdAt: -1, _id: -1 })
        .lean();
      rows.push(...rest);
    }
    const next = hasMore && tail ? cursorOf(tail) : "";
    return NextResponse.json({ success: true, data: rows, pendingCount, hasMore, next });
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
