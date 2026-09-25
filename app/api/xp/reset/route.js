export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { addPoints } from "@/lib/points";
import { getLevelByXp } from "@/lib/leveling";
import UserXp from "@/models/UserXp";

// 📌 관리자 테스트 초기화 — 관리자 본인 계정만 되돌린다. body { what: "enhance" | "pass" }
//    · enhance: 채팅 · 음성 강화 단계를 0 으로. 관리자 강화는 무료라(app/api/xp/enhance) 돌려줄 것이 없다.
//    · pass: 프리미엄 해금 · 수령 기록을 지운다. 해금 때 낸 값이 기록돼 있으면(passUnlockPaid) 그만큼 돌려준다.
//      이미 받은 보상(XP · 빙옥 · 역할)은 회수하지 않는다 — 다시 받을 수 있게 되는 것뿐이다.
//    관리자 판정은 서버 세션으로 다시 한다 (화면의 표시는 믿지 않는다).
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isAdminName(session.user.name)) {
      return NextResponse.json({ success: false, message: "관리자만 초기화할 수 있습니다." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const what = body?.what === "pass" ? "pass" : body?.what === "enhance" ? "enhance" : "";
    if (!what) {
      return NextResponse.json({ success: false, message: "초기화할 항목을 골라 주세요." }, { status: 400 });
    }

    await connectToDatabase();
    const userId = session.user.id;

    if (what === "enhance") {
      await UserXp.updateOne({ userId }, { $set: { chatEnhance: 0, voiceEnhance: 0, updatedAt: new Date() } });
      return NextResponse.json({ success: true, message: "강화 단계를 초기화했습니다." });
    }

    // 해금 표시를 한 번에 내리면서 이전 값을 받아 온다 — 두 번 눌려도 환불은 한 번만 된다
    const before = await UserXp.findOneAndUpdate(
      { userId },
      {
        $set: {
          passUnlocked: false,
          passUnlockPaid: { method: "", amount: 0 },
          passClaimedFree: [],
          passClaimedPaid: [],
          updatedAt: new Date(),
        },
      },
      { new: false, projection: { passUnlocked: 1, passUnlockPaid: 1 } }
    ).lean();

    const paid = before?.passUnlocked ? before?.passUnlockPaid : null;
    let refund = "";
    if (paid?.amount > 0) {
      if (paid.method === "point") {
        await addPoints(userId, paid.amount);
        refund = ` · 빙옥 ${paid.amount.toLocaleString()} 환불`;
      } else if (paid.method === "xp") {
        // 해금 때 기준선(passBaseXp)도 같이 내렸으므로 같은 폭으로 되돌리고, 레벨을 다시 맞춘다
        const doc = await UserXp.findOneAndUpdate(
          { userId },
          { $inc: { xp: paid.amount, passBaseXp: paid.amount } },
          { new: true, projection: { xp: 1 } }
        ).lean();
        await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(doc?.xp ?? 0), needsRoleSync: true } });
        refund = ` · XP ${paid.amount.toLocaleString()} 환불`;
      }
    }

    return NextResponse.json({ success: true, message: `시즌 패스를 초기화했습니다${refund}.` });
  } catch (e) {
    console.error("관리자 초기화 오류:", e);
    return NextResponse.json({ success: false, message: "초기화 중 오류가 발생했습니다." }, { status: 500 });
  }
}
