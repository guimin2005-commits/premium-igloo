export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getPassState, grantReward } from "@/lib/seasonPass";
import { SEASON } from "@/lib/season";
import UserXp from "@/models/UserXp";

// ── [수령] 티어 보상 받기 — body { tid, track } ──
//    클라이언트가 보낸 진행도·해금 상태는 쓰지 않는다. getPassState 로 서버가 다시 계산한다.
//    📌 티어는 배열 인덱스가 아니라 tid("t7")로 지목한다 — 관리자가 시즌 도중 티어를 중간에
//       끼워 넣으면 인덱스가 밀려 엉뚱한 칸을 받거나 같은 보상을 두 번 받게 된다.
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const tid = String(body?.tid || "").trim();
    const track = body?.track;
    if (!tid) {
      return NextResponse.json({ success: false, message: "티어를 지정해 주세요." }, { status: 400 });
    }
    if (track !== "free" && track !== "paid") {
      return NextResponse.json({ success: false, message: "보상 트랙이 올바르지 않습니다." }, { status: 400 });
    }

    await connectToDatabase();
    const userId = session.user.id;
    const state = await getPassState(userId);

    if (!state.enabled) {
      return NextResponse.json({ success: false, message: "시즌 패스가 열려 있지 않습니다." }, { status: 403 });
    }
    const row = state.tiers.find((t) => t.tid === tid);
    if (!row) {
      return NextResponse.json({ success: false, message: "존재하지 않는 티어입니다." }, { status: 404 });
    }

    // 거절 사유를 하나씩 갈라 준다 — 화면이 "왜 못 받는지"를 그대로 띄울 수 있게
    const reward = row[track];
    if (reward.claimed) {
      return NextResponse.json({ success: false, message: "이미 수령했습니다." }, { status: 409 });
    }
    if (!row.reached) {
      return NextResponse.json({ success: false, message: "아직 이 티어에 도달하지 않았습니다." }, { status: 400 });
    }
    if (track === "paid" && !state.unlocked) {
      return NextResponse.json({ success: false, message: "프리미엄 트랙을 먼저 해금해 주세요." }, { status: 403 });
    }
    if (reward.kind === "none") {
      return NextResponse.json({ success: false, message: "받을 보상이 없는 칸입니다." }, { status: 400 });
    }
    if (!reward.claimable) {
      return NextResponse.json({ success: false, message: "지금은 수령할 수 없습니다." }, { status: 400 });
    }

    // 📌 자물쇠부터 — $addToSet 은 이미 들어 있으면 문서를 건드리지 않으므로,
    //    modifiedCount 1 을 잡은 요청 하나만 지급으로 넘어간다 (동시 클릭 방어).
    //    ⚠️ 이 갱신에 updatedAt 같은 다른 $set 을 끼워 넣으면 안 된다 —
    //       중복이어도 문서가 바뀌어 modifiedCount 가 1이 되어 자물쇠가 풀린다.
    const field = track === "free" ? "passClaimedFree" : "passClaimedPaid";
    const claimLock = () =>
      UserXp.updateOne({ userId, passSeason: SEASON.number }, { $addToSet: { [field]: tid } });

    let lock = await claimLock();
    if (!lock.matchedCount && !(await UserXp.exists({ userId }))) {
      // 📌 디스코드에서 XP 를 한 번도 얻은 적 없는 유저 — 문서가 아직 없다.
      //    조회 경로(getPassState)는 일부러 만들지 않으므로(랭킹 오염) 쓰기인 여기서 만든다.
      //    need:0 티어가 있으면 첫 수령이 곧 첫 문서 생성이 된다.
      await UserXp.updateOne(
        { userId },
        {
          $setOnInsert: {
            userId,
            displayName: session.user.name || "",
            passSeason: SEASON.number,
            passBaseXp: 0,
          },
        },
        { upsert: true }
      ).catch((e) => {
        if (e?.code !== 11000) throw e; // 경합 — 다른 요청이 먼저 만들었으면 그대로 진행
      });
      lock = await claimLock();
    }
    if (!lock.matchedCount) {
      return NextResponse.json(
        { success: false, message: "패스 정보가 갱신되었습니다. 새로고침 후 다시 시도해 주세요." },
        { status: 409 }
      );
    }
    if (!lock.modifiedCount) {
      return NextResponse.json({ success: false, message: "이미 수령했습니다." }, { status: 409 });
    }

    // 📌 XP 보상은 진행도(xp - passBaseXp)를 채우면 안 되지만, 기준선을 여기서 미리 올리면
    //    봇이 실제로 지급하기 전까지 진행도만 깎여 이미 도달한 티어가 잠긴다(봇은 30초 주기·로컬 구동).
    //    그래서 기준선 인상은 봇의 processPayouts 가 source:"pass" 지급과 같은 순간에 함께 한다.

    // 지급이 터지면 방금 넣은 자물쇠를 되돌려 다음에 다시 받을 수 있게 한다
    const tierLabel = `시즌 패스 ${row.level}티어 · ${track === "free" ? "무료" : "프리미엄"}`;
    let granted;
    try {
      granted = await grantReward(userId, reward, tierLabel, session.user.name || "", row.level);
    } catch (e) {
      await UserXp.updateOne({ userId }, { $pull: { [field]: tid } }).catch(() => {});
      throw e;
    }

    // POINT 잔액은 화면 상단 HUD가 바로 갱신할 수 있게 늘 함께 내려 준다
    const point =
      granted.point ?? (await UserXp.findOne({ userId }, { point: 1 }).lean())?.point ?? 0;

    const message = granted.queued
      ? `${reward.label} 보상을 예약했습니다. 잠시 후 자동으로 지급됩니다.`
      : `${reward.label} 보상을 받았습니다.`;

    return NextResponse.json({
      success: true,
      message,
      reward: { kind: reward.kind, amount: reward.amount, label: reward.label },
      point,
    });
  } catch (e) {
    console.error("시즌 패스 수령 오류:", e);
    return NextResponse.json({ success: false, message: "수령 중 오류가 발생했습니다." }, { status: 500 });
  }
}
