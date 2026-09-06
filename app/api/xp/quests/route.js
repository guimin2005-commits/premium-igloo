export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getQuestState, ATTEND_QUEST_ID, PERIOD_LABEL } from "@/lib/quests";
import { kstToday, periodKey } from "@/lib/kst";
import QuestClaim from "@/models/QuestClaim";
import Payout from "@/models/Payout";
import UserXp from "@/models/UserXp";
import { applyTierMultiplier, addPoints } from "@/lib/points";

// ── [조회] 오늘의 일일 퀘스트 + 내 진행도 ─────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const data = await getQuestState(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("일일 퀘스트 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [수령] 달성한 퀘스트의 보상 XP를 받는다 ────────────────────
//    진행도는 클라이언트를 믿지 않고 서버에서 XpLog로 다시 센다.
//    지급은 기존 Payout 대기열을 통한다 — 봇이 30초 주기로 처리하며
//    레벨 재계산·보상 역할 동기화까지 함께 해 준다.
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const questId = String(body?.questId || "").trim();
    if (!questId) {
      return NextResponse.json({ success: false, error: "퀘스트를 지정해 주세요." }, { status: 400 });
    }

    await connectToDatabase();
    const userId = session.user.id;

    const state = await getQuestState(userId);
    const quest = state.quests.find((q) => q.id === questId);

    if (!quest) return NextResponse.json({ success: false, error: "존재하지 않는 퀘스트입니다." }, { status: 404 });
    if (quest.claimed) return NextResponse.json({ success: false, error: "이미 수령한 보상입니다." }, { status: 409 });
    if (!quest.done) return NextResponse.json({ success: false, error: "아직 목표를 달성하지 않았습니다." }, { status: 400 });
    if (quest.rewardXp <= 0) return NextResponse.json({ success: false, error: "보상이 없는 목표입니다." }, { status: 400 });

    const today = kstToday();
    const isAttend = questId === ATTEND_QUEST_ID;
    if (isAttend) {
      // 출석은 봇이 기준 시간을 채우는 순간 자동 지급한다 — 수령 경로가 없다
      return NextResponse.json(
        { success: false, error: "출석 보상은 기준 시간을 채우면 자동으로 지급됩니다." },
        { status: 400 }
      );
    }
    // 주기별 잠금 키 — 일일/주간/월간이 각자 초기화된다
    const lockKey = periodKey(quest.period || "daily");

    // 등급이 높을수록 퀘스트 POINT 를 더 받는다 — 지급 시점의 레벨로 곱한다
    const meDoc = await UserXp.findOne({ userId }, { level: 1 }).lean();
    const payPoint = applyTierMultiplier(quest.rewardPoint || 0, meDoc?.level || 0);
    const payPassPoint = quest.rewardPassPoint || 0;

    // 1) 자물쇠부터 — QuestClaim 유니크 인덱스(userId, date, questId)가 중복 수령을 막는다.
    //    실지급액을 이 원장에 함께 남긴다 — 나중에 "왜 이만큼이냐"에 답할 수 있어야 한다.
    let claim;
    try {
      claim = await QuestClaim.create({
        userId,
        date: lockKey,
        questId,
        questName: quest.name,
        amount: quest.rewardXp,
        pointAmount: payPoint,
        passPoint: payPassPoint,
      });
    } catch (e) {
      if (e?.code === 11000) {
        return NextResponse.json({ success: false, error: "이미 수령한 보상입니다." }, { status: 409 });
      }
      throw e;
    }
    const unlock = () => QuestClaim.deleteOne({ _id: claim._id }).catch(() => {});

    // 2) 자물쇠를 잡은 뒤에만 지급 예약. 실패하면 자물쇠를 풀어 다시 시도할 수 있게 한다.
    try {
      await Payout.create({
        userName: session.user.name || "",
        userId,
        amount: quest.rewardXp,
        reason: `${PERIOD_LABEL[quest.period] || "일일"} 퀘스트: ${quest.name}`,
        source: "quest",
      });
    } catch (e) {
      await unlock();
      throw e;
    }

    // POINT 는 큐를 타지 않는다 — 디스코드 부작용이 없으므로 사이트가 바로 쓴다.
    //    자물쇠(QuestClaim)를 이미 잡았으므로 중복 지급은 구조적으로 막혀 있다.
    if (payPoint > 0) await addPoints(userId, payPoint).catch(() => {});

    const next = await getQuestState(userId);
    return NextResponse.json({
      success: true,
      data: { ...next, claimed: { name: quest.name, amount: quest.rewardXp, point: payPoint } },
    });
  } catch (e) {
    console.error("일일 퀘스트 수령 오류:", e);
    return NextResponse.json({ success: false, error: "수령 중 오류가 발생했습니다." }, { status: 500 });
  }
}
