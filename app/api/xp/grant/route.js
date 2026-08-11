export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import UserXp from "@/models/UserXp";
import Payout from "@/models/Payout";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return { ok: isAdminName(session?.user?.name), session };
};

// ── [조회] 최근 수동 지급 이력 ──
export async function GET() {
  try {
    const { ok } = await requireAdmin();
    if (!ok) return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });

    await connectToDatabase();
    const rows = await Payout.find({ source: { $in: ["manual", "admin"] } })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [지급] 관리자가 XP를 직접 주거나 회수 ──
//    실제 반영은 봇의 자동 지급 큐가 30초 안에 처리한다 (레벨 재계산 포함)
export async function POST(request) {
  try {
    const { ok, session } = await requireAdmin();
    if (!ok) return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });

    await connectToDatabase();
    const { target, amount, reason, mode } = await request.json();

    // ── [초기화] 보유 XP와 레벨을 0으로 되돌린다 ──
    //    큐를 거치지 않고 즉시 반영한다 (누적값을 지우는 작업이라 증감으로는 표현할 수 없다)
    if (mode === "reset") {
      const filter = target === "all"
        ? {}
        : { $or: [{ userId: (target || "").trim() }, { username: (target || "").trim() }, { displayName: (target || "").trim() }] };

      if (target !== "all" && !(target || "").trim()) {
        return NextResponse.json({ success: false, message: "초기화할 대상을 입력해주세요." }, { status: 400 });
      }

      const rows = await UserXp.find(filter, { userId: 1, username: 1, displayName: 1, xp: 1 }).lean();
      if (rows.length === 0) {
        return NextResponse.json({ success: false, message: "해당 유저를 찾을 수 없습니다." }, { status: 404 });
      }

      await UserXp.updateMany(filter, { $set: { xp: 0, level: 0, updatedAt: new Date() } });

      // 감사 기록 — 이미 반영했으므로 봇 큐가 다시 집지 않도록 paid로 남긴다
      const who = session?.user?.name || "admin";
      await Payout.insertMany(
        rows.map((r) => ({
          userName: r.displayName || r.username || "",
          userId: r.userId,
          amount: -(r.xp || 0),
          reason: (reason || "").trim() || `관리자 초기화 (${who})`,
          source: "manual",
          status: "paid",
          paidAt: new Date(),
        }))
      );

      return NextResponse.json({
        success: true,
        message: `${rows.length}명의 XP·레벨을 0으로 초기화했습니다. 이미 지급된 역할은 그대로 남습니다.`,
        data: { count: rows.length },
      });
    }

    const value = Math.trunc(Number(amount) || 0);
    if (!value) {
      return NextResponse.json({ success: false, message: "지급할 XP를 입력해주세요. (회수는 음수)" }, { status: 400 });
    }

    // 대상 확인 — "all"이면 XP 기록이 있는 전원
    let targets = [];
    if (target === "all") {
      targets = await UserXp.find({}, { userId: 1, username: 1, displayName: 1 }).lean();
      if (targets.length === 0) {
        return NextResponse.json({ success: false, message: "지급 대상이 없습니다." }, { status: 404 });
      }
    } else {
      const key = (target || "").trim();
      if (!key) {
        return NextResponse.json({ success: false, message: "지급 대상을 입력해주세요." }, { status: 400 });
      }
      targets = await UserXp.find(
        { $or: [{ userId: key }, { username: key }, { displayName: key }] },
        { userId: 1, username: 1, displayName: 1 }
      ).lean();
      if (targets.length === 0) {
        return NextResponse.json({ success: false, message: "해당 유저를 찾을 수 없습니다." }, { status: 404 });
      }
    }

    // 회수는 보유량을 넘지 않게 잘라 넣는다 (마이너스 방지)
    const docs = [];
    for (const t of targets) {
      let give = value;
      if (value < 0) {
        const cur = await UserXp.findOne({ userId: t.userId }, { xp: 1 }).lean();
        give = -Math.min(Math.abs(value), cur?.xp ?? 0);
        if (give === 0) continue;
      }
      docs.push({
        userName: t.displayName || t.username || "",
        userId: t.userId,
        amount: give,
        reason: (reason || "").trim() || `관리자 ${value > 0 ? "지급" : "회수"} (${session?.user?.name || "admin"})`,
        source: "manual",
      });
    }

    if (docs.length === 0) {
      return NextResponse.json({ success: false, message: "회수할 XP가 있는 유저가 없습니다." }, { status: 400 });
    }
    await Payout.insertMany(docs);

    return NextResponse.json({
      success: true,
      message: `${docs.length}명에게 ${value > 0 ? "지급" : "회수"} 예약했습니다. 봇이 30초 이내에 반영합니다.`,
      data: { count: docs.length },
    });
  } catch (e) {
    console.error("XP 수동 지급 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
