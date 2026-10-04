export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import Payout from "@/models/Payout";

// ⚠️ 이 라우트는 실제 XP 지급 대기열을 다루므로 HTTP 메서드 전체가 관리자 전용이다.
//    (아래 createPayout은 HTTP 핸들러가 아니라 서버 내부 호출용 헬퍼이므로 가드 대상이 아니다)

// 내부에서 지급 대기 항목을 생성하는 헬퍼 (다른 라우트에서 import)
export async function createPayout({ userName, userId, amount, reason, source }) {
  if (!userName || !amount) return null;
  return Payout.create({ userName, userId: userId || "", amount, reason: reason || "", source: source || "etc" });
}

// [조회] 관리자 지급 대기열 (?status=pending|paid, 기본 전체)
export async function GET(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const query = status ? { status } : {};
    const payouts = await Payout.find(query).sort({ status: 1, createdAt: -1 });
    const pendingCount = await Payout.countDocuments({ status: "pending" });
    return NextResponse.json({ success: true, data: payouts, pendingCount });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [생성] 관리자 수동 지급 항목 추가
export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { userName, userId, amount, reason } = await request.json();
    if (!userName || !amount) {
      return NextResponse.json({ success: false, error: "닉네임과 수량은 필수입니다." }, { status: 400 });
    }
    const doc = await createPayout({ userName, userId, amount: Number(amount), reason, source: "manual" });
    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [상태변경] 대기로 남은 빙옥 기록만 완료로 되돌린다
//    📌 XP 건은 봇 큐(status pending)가 지급한다. 여기서 상태를 바꾸면 이미 준 건을 대기로 돌려 다시 주거나
//       (paid → pending, 초기화 기록이면 음수가 한 번 더 빠진다), 주지 않은 건을 닫아 보상이 사라진다(pending → paid).
//       빙옥 건은 사이트가 이미 반영했고 봇은 집지 않으므로, 대기로 남은 기록을 완료로 되돌리는 것만 허용한다.
export async function PUT(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { id, status } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "ID가 없습니다." }, { status: 400 });
    if (status !== "paid") {
      return NextResponse.json({ success: false, error: "지급된 건은 되돌릴 수 없습니다." }, { status: 409 });
    }
    const doc = await Payout.findOneAndUpdate(
      { _id: id, status: "pending", currency: "point" },
      { $set: { status: "paid", paidAt: new Date() } },
      { new: true }
    );
    if (!doc) {
      return NextResponse.json({ success: false, error: "XP 지급은 봇이 처리합니다." }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [삭제] 아직 지급되지 않은 XP 건만 — 지급 취소
//    📌 2026-10-04 "아직 대기 중인 건만 지울 수 있게(=지급 취소) 하고, 완료 기록은 남김" —
//       지급된 건을 지우면 XP 는 그대로 남고 내역 · 이번 달 랭킹에서만 빠진다. 그래서 봇이 집기 전(pending)인 XP 건만 지운다.
//       대상을 찾지 못한 실패 건(failed — XP 가 들어가지 않았다)도 같이 지울 수 있다. 처리 중(processing)은 봇이 지급하는 중이라 막는다.
//       빙옥 건은 사이트가 이미 반영한 기록이라 대기로 남았어도 지우지 않는다(완료로 되돌리기만 — PUT).
//       조건부 삭제 — 지우는 사이 봇이 집어 갔으면 지우지 않는다
const CANCELABLE = { currency: { $ne: "point" }, status: { $in: ["pending", "failed"] } };
export async function DELETE(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID가 없습니다." }, { status: 400 });
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, error: "ID가 올바르지 않습니다." }, { status: 400 });
    const gone = await Payout.findOneAndDelete({ _id: id, ...CANCELABLE });
    if (!gone) {
      const cur = await Payout.findById(id, { status: 1, currency: 1 }).lean();
      if (!cur) return NextResponse.json({ success: false, error: "이미 없는 항목입니다." }, { status: 404 });
      const error =
        cur.status === "processing" ? "봇이 지급하는 중입니다." :
        cur.currency === "point" ? "빙옥 기록은 취소할 수 없습니다." :
        "지급된 기록은 취소할 수 없습니다.";
      return NextResponse.json({ success: false, error }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
