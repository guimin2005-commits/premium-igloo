export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getPassState, grantReward } from "@/lib/seasonPass";
import { SEASON } from "@/lib/season";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { logWallet } from "@/lib/wallet";
import UserXp from "@/models/UserXp";

// ── [수령] 티어 보상 받기 — body { tid, track } ──
//    한 번 받기 = 그 티어 · 그 트랙의 보상 전부(최대 4개).
//    클라이언트가 보낸 진행도·해금 상태는 쓰지 않는다. getPassState 로 서버가 다시 계산한다(프리미엄 = 구매 또는 서버 부스터).
//    📌 티어는 배열 인덱스가 아니라 tid("t7")로 지목한다 — 관리자가 시즌 도중 티어를 중간에
//       끼워 넣으면 인덱스가 밀려 엉뚱한 칸을 받거나 같은 보상을 두 번 받게 된다.
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }
    // 점검 중에는 수령을 막는다 (관리자 통과)
    const maint = await denyIfMaintenance(session);
    if (maint) return maint;

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
    const closed = await denyIfLevelClosed(session);
    if (closed) return closed;
    const userId = session.user.id;
    const userName = session.user.name || "";
    const state = await getPassState(userId);

    if (!state.enabled) {
      return NextResponse.json({ success: false, message: "시즌 패스가 열려 있지 않습니다." }, { status: 403 });
    }
    const row = state.tiers.find((t) => t.tid === tid);
    if (!row) {
      return NextResponse.json({ success: false, message: "존재하지 않는 티어입니다." }, { status: 404 });
    }

    // 거절 사유를 하나씩 갈라 준다 — 화면이 "왜 못 받는지"를 그대로 띄울 수 있게
    const cell = row[track];
    if (cell.claimed) {
      return NextResponse.json({ success: false, message: "이미 수령했습니다." }, { status: 409 });
    }
    if (!row.reached) {
      return NextResponse.json({ success: false, message: "아직 이 티어에 도달하지 않았습니다." }, { status: 400 });
    }
    if (track === "paid" && !state.unlocked) {
      return NextResponse.json({ success: false, message: "프리미엄 트랙이 잠겨 있습니다." }, { status: 403 });
    }
    if (!cell.rewards.length) {
      return NextResponse.json({ success: false, message: "받을 보상이 없는 칸입니다." }, { status: 400 });
    }
    if (!cell.claimable) {
      return NextResponse.json({ success: false, message: "지금은 수령할 수 없습니다." }, { status: 400 });
    }

    // 📌 자물쇠부터 — 수령 기록에 tid 가 없을 때만 넣는 조건부 갱신이라, 동시에 눌러도 한 요청만 잡는다.
    //    잡은 요청은 갱신된 수령 기록을 함께 받는다 — 앞선 요청이 일부만 주고 남긴 표시(rewardKeys)를
    //    자물쇠를 잡은 뒤의 값으로 읽어야, 그 사이 바뀐 기록 때문에 같은 보상을 두 번 주지 않는다.
    //    시즌 번호는 한 번만 읽는다 — 조건과 기록이 같은 시즌을 가리키게
    const seasonNo = SEASON.number;
    const field = track === "free" ? "passClaimedFree" : "passClaimedPaid";
    const takeLock = () =>
      UserXp.findOneAndUpdate(
        { userId, passSeason: seasonNo, [field]: { $ne: tid } },
        { $push: { [field]: tid } },
        { new: true, projection: { [field]: 1 } }
      ).lean();

    let held = await takeLock();
    if (!held && !(await UserXp.exists({ userId }))) {
      // 📌 디스코드에서 XP 를 한 번도 얻은 적 없는 유저 — 문서가 아직 없다.
      //    조회 경로(getPassState)는 일부러 만들지 않으므로(랭킹 오염) 쓰기인 여기서 만든다.
      //    need:0 티어가 있으면 첫 수령이 곧 첫 문서 생성이 된다.
      await UserXp.updateOne(
        { userId },
        {
          $setOnInsert: {
            userId,
            displayName: userName,
            passSeason: seasonNo,
            passBaseXp: 0,
          },
        },
        { upsert: true }
      ).catch((e) => {
        if (e?.code !== 11000) throw e; // 경합 — 다른 요청이 먼저 만들었으면 그대로 진행
      });
      held = await takeLock();
    }
    if (!held) {
      const cur = await UserXp.findOne({ userId }, { passSeason: 1, [field]: 1 }).lean();
      const already = cur?.passSeason === seasonNo && (cur?.[field] || []).map(String).includes(tid);
      return NextResponse.json(
        { success: false, message: already ? "이미 수령했습니다." : "패스 정보가 갱신되었습니다. 새로고침 후 다시 시도해 주세요." },
        { status: 409 }
      );
    }

    // 자물쇠를 잡은 뒤의 기록으로 — 이미 받은 보상(부분 수령 표시)은 건너뛴다
    const done = new Set((held[field] || []).map(String));
    const todo = cell.rewards.filter((r) => !done.has(r.key));
    // 이 칸의 옛 부분 수령 표시 — 전부 받으면 tid 하나로 충분하므로 치운다
    const partialKeys = [...done].filter((k) => k.startsWith(`${tid}#`));
    const clearPartial = () =>
      partialKeys.length
        ? UserXp.updateOne({ userId }, { $pull: { [field]: { $in: partialKeys } } }).catch(() => {})
        : null;
    if (!todo.length) {
      await clearPartial();
      return NextResponse.json({ success: false, message: "이미 수령했습니다." }, { status: 409 });
    }

    // 📌 XP 보상은 진행도(xp - passBaseXp)를 채우면 안 되지만, 기준선을 여기서 미리 올리면
    //    봇이 실제로 지급하기 전까지 진행도만 깎여 이미 도달한 티어가 잠긴다(봇은 30초 주기·로컬 구동).
    //    그래서 기준선 인상은 봇의 processPayouts 가 source:"pass" 지급과 같은 순간에 함께 한다.
    const trackName = track === "free" ? "무료" : "프리미엄";
    const tierLabel = `시즌 패스 ${row.level}티어 · ${trackName}`;

    // 📌 보상마다 따로 지급한다 — 하나가 실패해도(지워진 아이템 · 일시 오류) 나머지는 계속 준다.
    //    실패분은 아래에서 "받은 것만 표시 + 자물쇠 풀기"로 남겨, 다시 받기가 실패분만 주게 한다.
    //    (전체 되돌림은 이미 봇 큐에 들어간 XP · 역할이나 써 버린 빙옥을 되돌릴 수 없어 택하지 않았다)
    const granted = [];
    const failed = [];
    for (const r of todo) {
      try {
        granted.push({ r, g: await grantReward(userId, r, tierLabel, userName, row.level) });
      } catch (e) {
        console.error(`시즌 패스 보상 지급 실패 (${userId} ${tid} ${track} ${r.key}):`, e);
        failed.push(r);
      }
    }

    if (!failed.length) {
      await clearPartial();
    } else if (!granted.length) {
      // 하나도 못 줬다 — 자물쇠만 되돌리면 처음과 같다
      await UserXp.updateOne({ userId }, { $pull: { [field]: tid } }).catch(() => {});
    } else {
      // 일부만 줬다 — 받은 것을 먼저 적고 나서 자물쇠를 푼다(이 순서여야 푸는 순간 다른 요청이 받은 것을 또 주지 않는다).
      //    적기에 실패하면 자물쇠를 그대로 둔다 — 남은 보상을 못 받는 쪽이 같은 보상을 두 번 주는 쪽보다 낫다(운영진이 수동 지급)
      try {
        await UserXp.updateOne({ userId }, { $addToSet: { [field]: { $each: granted.map((x) => x.r.key) } } });
        await UserXp.updateOne({ userId }, { $pull: { [field]: tid } });
      } catch (e) {
        console.error(`시즌 패스 부분 수령 기록 실패 — 자물쇠 유지 (${userId} ${tid} ${track}):`, e);
      }
    }

    if (!granted.length) {
      return NextResponse.json({ success: false, message: "수령 중 오류가 발생했습니다." }, { status: 500 });
    }

    // 📌 빙옥 보상은 grantReward 가 잔액에 바로 넣고 Payout 을 남기지 않는다 — 원장에 여기서 한 줄 남긴다(이번 수령분 합계 한 줄).
    //    XP 보상은 Payout(source "pass"), 역할 · 아이템은 재화가 아니다. lib/seasonPass.js 가 따로 기록하면 두 번 보인다
    const pointSum = granted.reduce((s, x) => s + (x.g.kind === "point" ? x.g.amount : 0), 0);
    if (pointSum > 0) {
      await logWallet({
        userId,
        currency: "point",
        amount: pointSum,
        kind: "pass-point",
        label: tierLabel,
        refId: `${tid}:${track}`,
      });
    }

    // POINT 잔액은 화면 상단 HUD가 바로 갱신할 수 있게 늘 함께 내려 준다
    const point = (await UserXp.findOne({ userId }, { point: 1 }).lean())?.point ?? 0;

    const queued = granted.some((x) => x.g.queued);
    const message = failed.length
      ? `보상 ${todo.length}개 중 ${granted.length}개를 받았습니다. 나머지는 잠시 후 다시 받아 주세요.`
      : granted.length === 1
        ? queued
          ? `${granted[0].r.label} 보상을 예약했습니다. 잠시 후 자동으로 지급됩니다.`
          : `${granted[0].r.label} 보상을 받았습니다.`
        : `T${row.level} ${trackName} 보상 ${granted.length}개를 받았습니다.${queued ? " 일부는 잠시 후 지급됩니다." : ""}`;

    return NextResponse.json({
      success: true,
      partial: failed.length > 0,
      message,
      rewards: granted.map((x) => ({ kind: x.r.kind, amount: x.r.amount, label: x.r.label })),
      point,
    });
  } catch (e) {
    console.error("시즌 패스 수령 오류:", e);
    return NextResponse.json({ success: false, message: "수령 중 오류가 발생했습니다." }, { status: 500 });
  }
}
