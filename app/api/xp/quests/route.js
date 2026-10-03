export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getQuestState, ATTEND_QUEST_ID, PERIOD_LABEL } from "@/lib/quests";
import { periodKey } from "@/lib/kst";
import QuestClaim from "@/models/QuestClaim";
import Payout from "@/models/Payout";
import { addPoints } from "@/lib/points";
import { getPerks } from "@/lib/itemPerks";
import { withBonus } from "@/lib/itemEffects";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { denyIfMaintenance } from "@/lib/apiAuth";

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

// 📌 퀘스트 한 건 수령 — 한 건 받기(questId)와 모두 받기(all)가 같은 함수를 퀘스트마다 부른다(잠금 · 기록 · 지급이 하나뿐).
//    state 는 호출부가 getQuestState 로 센 진행도. 반환 { ok: true, got } 또는 { ok: false, status, error }.
//    던지면(DB 오류) 자물쇠는 이미 풀려 있다 — 다시 받을 수 있다
async function claimOne({ userId, userName, state, quest, bonusPct }) {
  if (quest.claimed) return { ok: false, status: 409, error: "이미 수령한 보상입니다." };
  if (!quest.done) return { ok: false, status: 400, error: "아직 목표를 달성하지 않았습니다." };
  // XP·POINT 둘 다 0일 때만 거절한다 — POINT 만 주는 퀘스트도 수령 대상이다
  if (quest.rewardXp <= 0 && (quest.rewardPoint || 0) <= 0) {
    return { ok: false, status: 400, error: "보상이 없는 목표입니다." };
  }
  if (quest.id === ATTEND_QUEST_ID) {
    // 출석은 봇이 기준 시간을 채우는 순간 자동 지급한다 — 수령 경로가 없다
    return { ok: false, status: 400, error: "출석 보상은 기준 시간을 채우면 자동으로 지급됩니다." };
  }

  // 주기별 잠금 키 — 일일/주간/월간이 각자 초기화된다
  //    📌 진행도를 센 그 기간의 키(state.keys)로 잠근다 — 자정 · 월요일 0시 · 1일 0시 직전에 누르면 다시 계산한 키가 새 기간으로 넘어가
  //       지난 기간 달성분이 새 기간 몫을 잠가 버린다
  const lockKey = state.keys?.[quest.period] || periodKey(quest.period || "daily");

  // 📌 퀘스트 보상 보너스(아이템 효과 questBonus — 상한 적용 %)는 XP · 빙옥 둘 다에 얹는다(버림). 패스 포인트는 그대로.
  //    등급 배율은 없다(2026-10-03 "빙옥은 등급에 따라 더 받습니다 — 이딴 거 없어") — 승급 빙옥 없음(10/1)과 같은 결정
  const payXp = withBonus(quest.rewardXp || 0, bonusPct);
  const payPoint = withBonus(quest.rewardPoint || 0, bonusPct);
  const payPassPoint = quest.rewardPassPoint || 0;
  const label = `${PERIOD_LABEL[quest.period] || "일일"} 퀘스트: ${quest.name}`;

  // 1) 자물쇠부터 — QuestClaim 유니크 인덱스(userId, date, questId)가 중복 수령을 막는다.
  //    실지급액을 이 원장에 함께 남긴다 — 나중에 "왜 이만큼이냐"에 답할 수 있어야 한다.
  let claim;
  try {
    claim = await QuestClaim.create({
      userId,
      date: lockKey,
      questId: quest.id,
      questName: quest.name,
      amount: payXp,
      pointAmount: payPoint,
      passPoint: payPassPoint,
    });
  } catch (e) {
    if (e?.code === 11000) return { ok: false, status: 409, error: "이미 수령한 보상입니다." };
    throw e;
  }
  const unlock = () => QuestClaim.deleteOne({ _id: claim._id }).catch(() => {});

  // 2) 자물쇠를 잡은 뒤에만 지급 예약. 실패하면 자물쇠를 풀어 다시 시도할 수 있게 한다.
  //    XP 가 0 인 퀘스트(POINT 전용)는 큐에 넣지 않는다 — 봇이 0 XP 를 처리하며 도는 빈 작업만 쌓인다.
  let queued = null;
  if (payXp > 0) {
    try {
      queued = await Payout.create({
        userName: userName || "",
        userId,
        amount: payXp,
        reason: label,
        source: "quest",
      });
    } catch (e) {
      await unlock();
      throw e;
    }
  }

  // POINT 는 큐를 타지 않는다 — 디스코드 부작용이 없으므로 사이트가 바로 쓴다.
  //    자물쇠(QuestClaim)를 이미 잡았으므로 중복 지급은 구조적으로 막혀 있다.
  //    다만 실패를 삼키면 안 된다 — POINT 전용 퀘스트는 이게 유일한 지급이라 자물쇠만 남으면 그 주기 보상을 통째로 잃는다.
  //    📌 POINT 는 Payout 에 남지 않으므로 반영된 뒤 원장(WalletLog)에 한 줄 남긴다 — XP 몫은 위 Payout 이 센다
  if (payPoint > 0) {
    try {
      await addPoints(userId, payPoint, { kind: "quest-point", label, refId: String(claim._id) });
    } catch (e) {
      // 자물쇠만 풀면 방금 넣은 XP 예약이 남아 다시 수령할 때 XP 가 두 번 나간다 — 봇이 아직 집지 않았으면 함께 지운다.
      //    이미 집어 갔으면(처리 중 · 지급) XP 는 나간 것이라 자물쇠를 남겨 둔다
      if (queued) {
        const del = await Payout.deleteOne({ _id: queued._id, status: "pending" }).catch(() => null);
        if (!del?.deletedCount) throw e;
      }
      await unlock();
      throw e;
    }
  }

  return { ok: true, got: { id: quest.id, name: quest.name, period: quest.period, amount: payXp, point: payPoint } };
}

// ── [수령] 달성한 퀘스트의 보상 XP를 받는다 ────────────────────
//    body { questId } — 한 건, { all: true } — 지금 받을 수 있는 퀘스트 전부(주기 상관없이).
//    진행도는 클라이언트를 믿지 않고 서버에서 XpLog로 다시 센다.
//    지급은 기존 Payout 대기열을 통한다 — 봇이 30초 주기로 처리하며
//    레벨 재계산·보상 역할 동기화까지 함께 해 준다.
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    // 점검 중에는 수령을 막는다 (관리자 통과)
    const maint = await denyIfMaintenance(session);
    if (maint) return maint;

    const body = await request.json().catch(() => ({}));
    const all = body?.all === true;
    const questId = String(body?.questId || "").trim();
    if (!all && !questId) {
      return NextResponse.json({ success: false, error: "퀘스트를 지정해 주세요." }, { status: 400 });
    }

    await connectToDatabase();
    const closed = await denyIfLevelClosed(session);
    if (closed) return closed;
    const userId = session.user.id;
    const userName = session.user.name || "";

    const [state, perks] = await Promise.all([getQuestState(userId), getPerks(userId)]);
    const bonusPct = perks.questBonus || 0;

    // ── 모두 받기 — 받을 수 있는 퀘스트마다 claimOne 을 차례로. 하나가 실패해도 받은 것은 받은 대로 두고 결과에 남긴다 ──
    if (all) {
      const todo = state.quests.filter((q) => q.claimable);
      if (!todo.length) {
        return NextResponse.json({ success: false, error: "받을 수 있는 보상이 없습니다." }, { status: 409 });
      }
      const got = [];
      const failed = [];
      for (const quest of todo) {
        try {
          const r = await claimOne({ userId, userName, state, quest, bonusPct });
          if (r.ok) got.push(r.got);
          else failed.push({ id: quest.id, name: quest.name, error: r.error, status: r.status });
        } catch (e) {
          console.error(`퀘스트 모두 받기 중 실패 (${userId} ${quest.id}):`, e);
          failed.push({ id: quest.id, name: quest.name, error: "수령 중 오류가 발생했습니다.", status: 500 });
        }
      }
      const next = await getQuestState(userId);
      const sum = got.reduce((s, g) => ({ xp: s.xp + g.amount, point: s.point + g.point }), { xp: 0, point: 0 });
      return NextResponse.json(
        {
          success: got.length > 0,
          ...(got.length ? {} : { error: failed[0]?.error || "수령하지 못했습니다." }),
          // claimedAll — 받은 목록 · 합계(XP · 빙옥, 보너스 포함) · 못 받은 목록(다른 창에서 먼저 받은 것 등)
          data: {
            ...next,
            claimedAll: { items: got, xp: sum.xp, point: sum.point, failed: failed.map(({ id, name, error }) => ({ id, name, error })), bonusPct },
          },
        },
        // 하나도 못 받았으면 첫 실패의 상태(409 이미 수령 등) — 일부라도 받았으면 200
        { status: got.length ? 200 : failed[0]?.status || 500 }
      );
    }

    const quest = state.quests.find((q) => q.id === questId);
    if (!quest) return NextResponse.json({ success: false, error: "존재하지 않는 퀘스트입니다." }, { status: 404 });

    const r = await claimOne({ userId, userName, state, quest, bonusPct });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });

    const next = await getQuestState(userId);
    return NextResponse.json({
      success: true,
      // amount · point 는 실제로 준 값(보너스 포함). bonusPct 는 붙은 퀘스트 보상 보너스 %
      data: { ...next, claimed: { name: quest.name, amount: r.got.amount, point: r.got.point, bonusPct } },
    });
  } catch (e) {
    console.error("일일 퀘스트 수령 오류:", e);
    return NextResponse.json({ success: false, error: "수령 중 오류가 발생했습니다." }, { status: 500 });
  }
}
