export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getPassState } from "@/lib/seasonPass";
import { SEASON } from "@/lib/season";
import { addPoints } from "@/lib/points";
import { getLevelByXp } from "@/lib/leveling";
import UserXp from "@/models/UserXp";

// 차감된 XP에 맞춰 레벨을 다시 계산한다 (내려갈 수 있다).
//    상점 결제(app/api/shop/checkout)와 같은 방식 — 봇이 보상 역할을 다시 맞추도록 표시도 함께 세운다.
const resyncLevel = async (userId) => {
  const doc = await UserXp.findOne({ userId }, { xp: 1 }).lean();
  await UserXp.updateOne(
    { userId },
    { $set: { level: getLevelByXp(doc?.xp ?? 0), needsRoleSync: true } }
  );
};

// ── [해금] 프리미엄 트랙 열기 — body { payMethod: "xp" | "point" } ──
//    한 번 열면 그 시즌 내내 열려 있다 (시즌이 바뀌면 passUnlocked 가 초기화된다).
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const payMethod = body?.payMethod === "point" ? "point" : body?.payMethod === "xp" ? "xp" : "";
    if (!payMethod) {
      return NextResponse.json({ success: false, message: "결제 수단을 선택해 주세요." }, { status: 400 });
    }

    await connectToDatabase();
    const userId = session.user.id;
    const state = await getPassState(userId);

    if (!state.enabled) {
      return NextResponse.json({ success: false, message: "시즌 패스가 열려 있지 않습니다." }, { status: 403 });
    }
    if (state.unlocked) {
      return NextResponse.json({ success: false, message: "이미 해금했습니다." }, { status: 409 });
    }

    // 가격은 서버 설정값만 쓴다 — 클라이언트가 보낸 금액은 보지 않는다
    const price = state.unlockPrice;

    // 1) 차감 — 잔액이 충분할 때만 매치되는 조건부 갱신이라 동시에 눌러도 마이너스가 되지 않는다
    if (price > 0) {
      if (payMethod === "point") {
        const paid = await addPoints(userId, -price);
        if (!paid) {
          return NextResponse.json({ success: false, message: "POINT가 부족합니다." }, { status: 400 });
        }
      } else {
        // XP 는 화폐이므로 쓰면 레벨도 함께 내려간다 — 봇이 역할을 다시 맞추도록 표시를 세운다.
        // 📌 기준선(passBaseXp)도 같은 폭으로 내린다. 진행도가 xp - passBaseXp 라 이걸 빠뜨리면
        //    방금 돈 내고 연 프리미엄 티어가 오히려 전부 미도달로 잠기고,
        //    이미 받은 무료 칸은 "미도달인데 수령완료" 인 모순 상태가 된다.
        //    (POINT 결제는 진행도와 무관하므로 건드리지 않는다)
        const paid = await UserXp.findOneAndUpdate(
          { userId, xp: { $gte: price } },
          { $inc: { xp: -price, passBaseXp: -price }, $set: { needsRoleSync: true, updatedAt: new Date() } },
          { new: true, projection: { xp: 1 } }
        );
        if (!paid) {
          return NextResponse.json({ success: false, message: "XP가 부족합니다." }, { status: 400 });
        }
        await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(paid.xp ?? 0) } });
      }
    }

    // 2) 해금 표시 — 조건부로 세우고, 못 세웠으면 방금 받은 값을 되돌린다
    const lock = await UserXp.updateOne(
      { userId, passSeason: SEASON.number, passUnlocked: { $ne: true } },
      { $set: { passUnlocked: true, updatedAt: new Date() } }
    );
    if (!lock.modifiedCount) {
      if (price > 0) {
        if (payMethod === "point") {
          await addPoints(userId, price).catch(() => {});
        } else {
          // 차감 때 기준선도 함께 내렸으므로 환불도 같은 폭으로 되돌린다
          await UserXp.updateOne({ userId }, { $inc: { xp: price, passBaseXp: price } }).catch(() => {});
          await resyncLevel(userId).catch(() => {});
        }
      }
      const now = await UserXp.findOne({ userId }, { passUnlocked: 1 }).lean();
      return NextResponse.json(
        {
          success: false,
          message: now?.passUnlocked
            ? "이미 해금했습니다."
            : "패스 정보가 갱신되었습니다. 새로고침 후 다시 시도해 주세요.",
        },
        { status: 409 }
      );
    }

    const bal = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    return NextResponse.json({
      success: true,
      message: "프리미엄 트랙을 해금했습니다. 이번 시즌 내내 유지됩니다.",
      unlocked: true,
      xp: bal?.xp ?? 0,
      point: bal?.point ?? 0,
    });
  } catch (e) {
    console.error("시즌 패스 해금 오류:", e);
    return NextResponse.json({ success: false, message: "해금 중 오류가 발생했습니다." }, { status: 500 });
  }
}
