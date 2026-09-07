export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { isMonthKey } from "@/lib/supporters";
import { addPoints } from "@/lib/points";
import SupporterEval from "@/models/SupporterEval";
import Payout from "@/models/Payout";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};
const denied = () => NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });

// ── [지급] draft → paid 조건부 갱신 후 XP(Payout 큐)·POINT(즉시) 지급 ──
//    body { userId, month }
//    자물쇠(status 갱신)에 성공한 요청만 지급하므로 두 번 눌러도 한 번만 나간다.
//    XP 큐를 먼저 넣고 POINT 를 나중에 쓴다 — POINT 를 먼저 주면 실패 롤백이 "잔액이 남아 있을 때만" 되돌아가
//    (유저가 그 사이 상점에서 쓰면 조건부 차감이 매치 0) draft 로 돌아간 평가를 다시 지급할 때 POINT 가 두 번 나간다.
//    큐 문서는 봇이 집어 가기 전(status pending)이면 확실히 지울 수 있다.
export async function POST(request) {
  try {
    if (!(await requireAdmin())) return denied();
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));

    const userId = typeof b.userId === "string" ? b.userId.trim() : "";
    const month = typeof b.month === "string" ? b.month.trim() : "";
    if (!userId || !isMonthKey(month)) {
      return NextResponse.json({ success: false, error: "대상과 월을 확인해 주세요." }, { status: 400 });
    }

    const ev = await SupporterEval.findOne({ userId, month }).lean();
    if (!ev) {
      return NextResponse.json({ success: false, error: "저장된 평가가 없습니다. 먼저 저장해 주세요." }, { status: 404 });
    }
    if (ev.status === "paid") {
      return NextResponse.json({ success: false, error: "이미 지급된 평가입니다." }, { status: 409 });
    }

    const now = new Date();
    const lock = await SupporterEval.updateOne(
      { _id: ev._id, status: "draft" },
      { $set: { status: "paid", paidAt: now, updatedAt: now } }
    );
    if (lock.modifiedCount !== 1) {
      return NextResponse.json({ success: false, error: "이미 지급된 평가입니다." }, { status: 409 });
    }

    const xp = Math.max(0, Math.floor(ev.xp || 0));
    const point = Math.max(0, Math.floor(ev.point || 0));
    const rollback = () =>
      SupporterEval.updateOne(
        { _id: ev._id, status: "paid", paidAt: now },
        { $set: { status: "draft", paidAt: null, updatedAt: new Date() } }
      ).catch(() => {});

    let queued = null;
    try {
      if (xp > 0) {
        queued = await Payout.create({
          // Payout.userName 은 required — 닉네임이 비어 있으면 ID 로 채운다 (봇은 멘션에 userId 를 쓴다)
          userName: ev.userName || userId,
          userId,
          amount: xp,
          reason: `서포터즈 활동 보상 ${month}`,
          source: "supporter",
        });
      }
      if (point > 0) await addPoints(userId, point);
    } catch (e) {
      // 지급이 어긋나면 상태를 되돌려 다시 시도할 수 있게 한다. 봇이 아직 안 가져간 큐 문서는 지운다.
      if (queued) await Payout.deleteOne({ _id: queued._id, status: "pending" }).catch(() => {});
      await rollback();
      console.error("서포터즈 지급 오류:", e);
      return NextResponse.json({ success: false, error: "지급 중 오류가 발생했습니다. 다시 시도해 주세요." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      eval: { userId, month, grade: ev.grade || "", xp, point, note: ev.note || "", status: "paid", paidAt: now },
    });
  } catch (e) {
    console.error("서포터즈 지급 오류:", e);
    return NextResponse.json({ success: false, error: "지급 중 오류가 발생했습니다." }, { status: 500 });
  }
}
