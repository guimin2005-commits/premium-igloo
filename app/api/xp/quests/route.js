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
import RoleConfig from "@/models/RoleConfig";

// 📌 출석 역할 보너스를 얹으려면 멤버가 지금 들고 있는 역할을 알아야 한다.
//    /출석체크 를 없애면서 봇의 getAttendBuffXp 호출부가 사라졌고, 그때부터
//    RoleConfig.attendBuffXp 가 아무 데도 적용되지 않고 있었다. 지급 주체가
//    사이트로 옮겨졌으니 보정도 여기서 한다. (실패하면 기본 보상만 준다)
async function fetchMemberRoles(userId) {
  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!GUILD_ID || !BOT_TOKEN) return null;
  const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.roles) ? data.roles : null;
}

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
    // 주기별 잠금 키 — 일일/주간/월간이 각자 초기화된다
    const lockKey = periodKey(quest.period || "daily");

    // 1) 자물쇠부터 — 하루 한 번만 통과하는 조건부 갱신/유니크 인덱스로 중복 지급을 막는다.
    //    출석은 봇의 출석 기록과 같은 자물쇠(lastAttendDate)를 써서 양쪽이 겹치지 않게 한다.
    let unlock;
    if (isAttend) {
      const before = await UserXp.findOne({ userId }, { lastAttendDate: 1 }).lean();
      const res = await UserXp.updateOne(
        { userId, lastAttendDate: { $ne: today } },
        { $set: { lastAttendDate: today, updatedAt: new Date() }, $inc: { attendCount: 1 } }
      );
      if (res.matchedCount === 0) {
        return NextResponse.json({ success: false, error: "오늘 출석 보상은 이미 받았습니다." }, { status: 409 });
      }
      unlock = () =>
        UserXp.updateOne(
          { userId },
          { $set: { lastAttendDate: before?.lastAttendDate || "" }, $inc: { attendCount: -1 } }
        ).catch(() => {});
    } else {
      let claim;
      try {
        claim = await QuestClaim.create({
          userId,
          date: lockKey,
          questId,
          questName: quest.name,
          amount: quest.rewardXp,
        });
      } catch (e) {
        if (e?.code === 11000) {
          return NextResponse.json({ success: false, error: "이미 수령한 보상입니다." }, { status: 409 });
        }
        throw e;
      }
      unlock = () => QuestClaim.deleteOne({ _id: claim._id }).catch(() => {});
    }

    // 출석 보상에는 역할 보너스를 얹는다
    let payAmount = quest.rewardXp;
    if (isAttend) {
      try {
        const held = await fetchMemberRoles(userId);
        if (held?.length) {
          const cfgs = await RoleConfig.find(
            { roleId: { $in: held }, attendBuffXp: { $gt: 0 } },
            { attendBuffXp: 1 }
          ).lean();
          payAmount += cfgs.reduce((n, c) => n + (c.attendBuffXp || 0), 0);
        }
      } catch {
        // 역할을 못 읽으면 기본 보상만 지급한다 — 수령 자체를 막지는 않는다
      }
    }

    // 2) 자물쇠를 잡은 뒤에만 지급 예약. 실패하면 자물쇠를 풀어 다시 시도할 수 있게 한다.
    try {
      await Payout.create({
        userName: session.user.name || "",
        userId,
        amount: payAmount,
        reason: isAttend ? "일일 출석 보상" : `${PERIOD_LABEL[quest.period] || "일일"} 퀘스트: ${quest.name}`,
        source: "quest",
      });
    } catch (e) {
      await unlock();
      throw e;
    }

    const next = await getQuestState(userId);
    return NextResponse.json({
      success: true,
      data: { ...next, claimed: { name: quest.name, amount: payAmount } },
    });
  } catch (e) {
    console.error("일일 퀘스트 수령 오류:", e);
    return NextResponse.json({ success: false, error: "수령 중 오류가 발생했습니다." }, { status: 500 });
  }
}
