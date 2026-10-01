export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getPassState } from "@/lib/seasonPass";
import { SEASON, getSeasonDday } from "@/lib/season";
import { addPoints } from "@/lib/points";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { logWallet } from "@/lib/wallet";
import UserXp from "@/models/UserXp";

// ── [해금] 프리미엄 트랙 열기 — 빙옥 전용 ──
//    한 번 열면 그 시즌 내내 열려 있다 (시즌이 바뀌면 passUnlocked 가 초기화된다).
//    📌 2026-09 — XP 결제를 없앴다. 진행도가 "이번 시즌에 번 XP" 라, 해금가만큼 XP 를 모은 유저는
//       이미 티어가 올라 있어 사자마자 프리미엄이 한꺼번에 풀리는 구조였다(사용자 지적).
//       서버 부스터는 사지 않아도 자동으로 열린다(lib/seasonPass.js getPassState 의 premiumBy).
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }
    // 점검 중에는 해금을 막는다 (관리자 통과)
    const maint = await denyIfMaintenance(session);
    if (maint) return maint;

    // 예전 화면(캐시)이 XP 결제를 보내면 빙옥으로 바꿔 빼지 않고 거절한다 — 유저가 확인한 화폐와 다른 걸 빼면 안 된다
    const body = await request.json().catch(() => ({}));
    if (body?.payMethod === "xp") {
      return NextResponse.json({ success: false, message: "프리미엄 해금은 빙옥으로만 할 수 있습니다." }, { status: 400 });
    }

    await connectToDatabase();
    const closed = await denyIfLevelClosed(session);
    if (closed) return closed;
    const userId = session.user.id;
    const state = await getPassState(userId);

    if (!state.enabled) {
      return NextResponse.json({ success: false, message: "시즌 패스가 열려 있지 않습니다." }, { status: 403 });
    }
    // 📌 끝난 시즌은 해금을 받지 않는다 — 시즌은 lib/season.js 의 날짜로 자동으로 넘어가지만,
    //    마지막 시즌이 끝난 뒤 다음 시즌을 SEASONS 에 넣기 전까지는 끝난 시즌이 지금 시즌으로 남는다(currentSeason).
    //    그 사이 해금하면 새 시즌이 들어오는 순간 롤오버(getPassState)가 해금을 환불 없이 비운다. 수령은 막지 않는다(이미 번 보상)
    //    시즌 경계(자정)에 걸친 요청은 아래 해금 표시 조건(passSeason)이 걸러 환불한다
    if (getSeasonDday().ended) {
      return NextResponse.json({ success: false, message: "시즌이 종료되었습니다." }, { status: 403 });
    }
    if (state.premiumBy === "purchase") {
      return NextResponse.json({ success: false, message: "이미 해금했습니다." }, { status: 409 });
    }
    // 부스터는 이미 열려 있다 — 돈을 받지 않는다
    if (state.premiumBy === "booster") {
      return NextResponse.json({ success: false, message: "서버 부스터는 자동으로 해금됩니다." }, { status: 409 });
    }
    // 부스터인지 확인하지 못했으면(디스코드 장애) 받지 않는다 — 부스터가 잠깐 잠긴 화면을 보고 사는 일을 막는다
    if (state.boosterUnknown) {
      return NextResponse.json(
        { success: false, message: "디스코드 확인이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 }
      );
    }

    // 가격은 서버 설정값만 쓴다 — 클라이언트가 보낸 금액은 보지 않는다.
    //    해금가는 XP 단위로 저장되고, 빙옥 환율(1 빙옥 = 10,000 XP · 올림 — lib/pointRate.js)을 적용한 값을 뺀다.
    //    📌 XP 로 내지 않으므로 진행도 기준선(passBaseXp)은 건드리지 않는다
    const charge = state.unlockPoint;
    // 📌 화면이 확인창에서 보여 준 금액(expectedPoint)과 다르면 빼지 않는다 — 보는 사이 관리자가 해금가를 바꾼 경우
    //    (상점 expectedPrice · 강화 expectedCost 와 같은 가드. 값이 없는 옛 화면 요청은 그대로 받는다)
    if (body?.expectedPoint != null && Number(body.expectedPoint) !== charge) {
      return NextResponse.json(
        { success: false, code: "PRICE_CHANGED", message: "해금 가격이 바뀌었습니다. 다시 확인해 주세요.", unlockPoint: charge },
        { status: 409 }
      );
    }

    // 1) 차감 — 잔액이 충분할 때만 매치되는 조건부 갱신이라 동시에 눌러도 마이너스가 되지 않는다
    if (charge > 0) {
      const paid = await addPoints(userId, -charge);
      if (!paid) {
        // 📌 두 번 눌림(다른 탭) — 앞 요청이 방금 빼 가서 잔액이 모자란 것이면 "부족"이 아니라 "이미 해금"으로 알린다
        const now = await UserXp.findOne({ userId }, { passSeason: 1, passUnlocked: 1 }).lean();
        if (now?.passUnlocked && now?.passSeason === SEASON.number) {
          return NextResponse.json({ success: false, message: "이미 해금했습니다." }, { status: 409 });
        }
        return NextResponse.json({ success: false, message: "빙옥이 부족합니다." }, { status: 400 });
      }
    }

    // 2) 해금 표시 — 조건부로 세우고, 못 세웠으면 방금 받은 값을 되돌린다
    //    시즌 번호는 한 번만 읽는다 — 조건과 원장 기록이 같은 시즌을 가리키게
    const seasonNo = SEASON.number;
    const lock = await UserXp.updateOne(
      { userId, passSeason: seasonNo, passUnlocked: { $ne: true } },
      { $set: { passUnlocked: true, passUnlockPaid: { method: "point", amount: charge }, updatedAt: new Date() } }
    );
    if (!lock.modifiedCount) {
      if (charge > 0) await addPoints(userId, charge).catch(() => {});
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

    // 📌 해금 비용은 Payout · Purchase 에 남지 않으므로 원장에 남긴다 — 해금 표시까지 확정된 뒤에만
    //    (위에서 되돌린 요청은 차감도 환불도 기록하지 않는다 — 내역에서 서로 상쇄될 줄을 만들지 않게)
    if (charge > 0) {
      await logWallet({
        userId,
        currency: "point",
        amount: -charge,
        kind: "pass-unlock",
        label: `시즌 ${seasonNo} 패스 프리미엄 해금`,
        meta: { season: seasonNo },
      });
    }

    const bal = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    return NextResponse.json({
      success: true,
      message: "프리미엄 트랙을 해금했습니다. 이번 시즌 내내 유지됩니다.",
      unlocked: true,
      premiumBy: "purchase",
      xp: bal?.xp ?? 0,
      point: bal?.point ?? 0,
    });
  } catch (e) {
    console.error("시즌 패스 해금 오류:", e);
    return NextResponse.json({ success: false, message: "해금 중 오류가 발생했습니다." }, { status: 500 });
  }
}
