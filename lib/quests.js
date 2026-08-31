import DailyQuest from "@/models/DailyQuest";
import QuestClaim from "@/models/QuestClaim";
import XpLog from "@/models/XpLog";
import UserXp from "@/models/UserXp";
import BotSetting from "@/models/BotSetting";
import { kstDayStart, kstToday } from "@/lib/kst";

// 📌 내장 출석 퀘스트의 고정 id — 관리자가 만든 퀘스트(_id)와 절대 겹치지 않는 문자열
export const ATTEND_QUEST_ID = "attend-daily";

// 📌 일일 퀘스트 진행도 계산 — 조회(GET)와 수령 검증(POST)이 반드시 같은 함수를 쓴다.
//    클라이언트가 보낸 진행도는 절대 믿지 않고, 여기서 XpLog로 매번 다시 센다.
export async function getQuestState(userId) {
  const today = kstToday();

  const [quests, buckets, claims, user, setting] = await Promise.all([
    DailyQuest.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
    // 오늘(KST) 지급 로그를 사유별로 건수·XP 합산
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: kstDayStart() } } },
      { $group: { _id: "$reason", count: { $sum: 1 }, xp: { $sum: "$amount" } } },
    ]),
    QuestClaim.find({ userId, date: today }, { questId: 1 }).lean(),
    UserXp.findOne({ userId }, { lastAttendDate: 1, attendCount: 1 }).lean(),
    BotSetting.findOne({ key: "main" }, { attendXp: 1, attendVoiceMin: 1, voiceIntervalSec: 1 }).lean(),
  ]);

  const by = { chat: { count: 0, xp: 0 }, voice: { count: 0, xp: 0 }, attend: { count: 0, xp: 0 }, any: { count: 0, xp: 0 } };
  for (const b of buckets) {
    if (by[b._id]) {
      by[b._id].count = b.count;
      by[b._id].xp = b.xp;
    }
    by.any.count += b.count;
    by.any.xp += b.xp;
  }

  const claimed = new Set(claims.map((c) => c.questId));

  // ── 내장 출석 퀘스트 — 음성 접속 누적 N분 달성 시 보상 ──
  //    봇이 voiceIntervalSec 마다 음성 XP를 1건씩 기록하므로,
  //    오늘의 voice 로그 건수 × 간격(분) = 오늘 음성 접속 시간.
  const attendXp = setting?.attendXp ?? 7000;
  const targetMin = Math.max(1, setting?.attendVoiceMin ?? 60);
  const tickMin = Math.max(1, Math.round((setting?.voiceIntervalSec ?? 300) / 60));
  const voiceMin = by.voice.count * tickMin;
  const attendDone = voiceMin >= targetMin;
  // 수령 여부는 QuestClaim이 아니라 lastAttendDate로 판정 — 봇의 출석 기록과 같은 자물쇠를 쓴다
  const attendClaimed = user?.lastAttendDate === today;

  const attendQuest = {
    id: ATTEND_QUEST_ID,
    builtin: true,
    name: `출석 — 음성 ${targetMin}분 접속`,
    desc: `음성 채널에 오늘 ${targetMin}분 이상 머무르면 출석 보상을 받을 수 있습니다`,
    reason: "voice",
    metric: "minute",
    target: targetMin,
    current: Math.min(voiceMin, targetMin),
    rewardXp: attendXp,
    done: attendDone,
    claimed: attendClaimed,
    claimable: attendDone && !attendClaimed && attendXp > 0,
  };

  const rows = quests.map((q) => {
    const src = by[q.reason] || by.any;
    const current = Math.min(q.metric === "xp" ? src.xp : src.count, q.target);
    const done = current >= q.target;
    const id = String(q._id);
    return {
      id,
      builtin: false,
      name: q.name,
      desc: q.desc || "",
      reason: q.reason,
      metric: q.metric,
      target: q.target,
      rewardXp: q.rewardXp,
      current,
      done,
      claimed: claimed.has(id),
      // 보상이 0인 퀘스트는 '목표'일 뿐이라 수령 버튼을 띄우지 않는다
      claimable: done && q.rewardXp > 0 && !claimed.has(id),
    };
  });

  return {
    date: today,
    voiceMin,               // 오늘 음성 접속 누적 분 (UI 안내용)
    attendCount: user?.attendCount || 0,
    lastAttendDate: user?.lastAttendDate || "",
    quests: [attendQuest, ...rows],
  };
}
