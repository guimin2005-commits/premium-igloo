export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
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

// [상태변경] 지급 완료 / 대기로 토글
export async function PUT(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { id, status } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "ID가 없습니다." }, { status: 400 });
    const update = status === "paid"
      ? { status: "paid", paidAt: new Date() }
      : { status: "pending", paidAt: null };
    const doc = await Payout.findByIdAndUpdate(id, update, { new: true });
    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [삭제] 지급 항목 제거
export async function DELETE(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID가 없습니다." }, { status: 400 });
    await Payout.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
