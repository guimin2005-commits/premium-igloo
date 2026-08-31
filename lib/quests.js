import DailyQuest from "@/models/DailyQuest";
import QuestClaim from "@/models/QuestClaim";
import XpLog from "@/models/XpLog";
import UserXp from "@/models/UserXp";
import BotSetting from "@/models/BotSetting";
import { kstDayStart, kstWeekStart, kstMonthStart, kstToday, periodKey } from "@/lib/kst";

// 📌 내장 출석 퀘스트의 고정 id — 관리자가 만든 퀘스트(_id)와 절대 겹치지 않는 문자열
export const ATTEND_QUEST_ID = "attend-daily";

export const PERIODS = ["daily", "weekly", "monthly"];

// 📌 주기별 무작위 노출 — 등록된 퀘스트를 매 주기마다 섞어 정해진 개수만 내보낸다.
//    시드를 "주기:기간키"로 고정하므로 (a) 모든 유저가 같은 세트를 보고
//    (b) 새로고침해도 바뀌지 않으며 (c) 날짜가 바뀌면 저절로 다시 뽑힌다.
//    수령 검증(POST)도 이 함수를 거친 목록만 인정하므로 안 뽑힌 퀘스트는 받을 수 없다.
const seedFrom = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function pickQuests(list, count, seedKey) {
  if (!count || count <= 0 || list.length <= count) return list;
  // 후보 순서를 _id로 고정 — DB가 돌려주는 순서가 결과를 바꾸지 않게 한다
  const pool = [...list].sort((a, b) => (String(a._id) < String(b._id) ? -1 : 1));
  const rand = mulberry32(seedFrom(seedKey));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
export const PERIOD_LABEL = { daily: "일일", weekly: "주간", monthly: "월간" };

// 📌 퀘스트 진행도 계산 — 조회(GET)와 수령 검증(POST)이 반드시 같은 함수를 쓴다.
//    클라이언트가 보낸 진행도는 절대 믿지 않고, 여기서 XpLog로 매번 다시 센다.
export async function getQuestState(userId) {
  const dayStart = kstDayStart();
  const weekStart = kstWeekStart();
  const monthStart = kstMonthStart();
  const keys = { daily: periodKey("daily"), weekly: periodKey("weekly"), monthly: periodKey("monthly") };

  const [quests, buckets, claims, user, setting] = await Promise.all([
    DailyQuest.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
    // 이번 달치를 사유별로 묶고, 그 안에서 이번 주/오늘치를 조건 합산 (쿼리 1회)
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: "$reason",
          monthlyCount: { $sum: 1 },
          monthlyXp: { $sum: "$amount" },
          weeklyCount: { $sum: { $cond: [{ $gte: ["$createdAt", weekStart] }, 1, 0] } },
          weeklyXp: { $sum: { $cond: [{ $gte: ["$createdAt", weekStart] }, "$amount", 0] } },
          dailyCount: { $sum: { $cond: [{ $gte: ["$createdAt", dayStart] }, 1, 0] } },
          dailyXp: { $sum: { $cond: [{ $gte: ["$createdAt", dayStart] }, "$amount", 0] } },
        },
      },
    ]),
    QuestClaim.find({ userId, date: { $in: Object.values(keys) } }, { questId: 1, date: 1 }).lean(),
    UserXp.findOne({ userId }, { lastAttendDate: 1, attendCount: 1 }).lean(),
    BotSetting.findOne(
      { key: "main" },
      { attendXp: 1, attendVoiceMin: 1, voiceIntervalSec: 1, questPickDaily: 1, questPickWeekly: 1, questPickMonthly: 1 }
    ).lean(),
  ]);

  // by[period][reason] = { count, xp }
  const blank = () => ({ chat: { count: 0, xp: 0 }, voice: { count: 0, xp: 0 }, attend: { count: 0, xp: 0 }, any: { count: 0, xp: 0 } });
  const by = { daily: blank(), weekly: blank(), monthly: blank() };
  for (const b of buckets) {
    for (const per of PERIODS) {
      const c = b[`${per}Count`] || 0;
      const x = b[`${per}Xp`] || 0;
      if (by[per][b._id]) {
        by[per][b._id].count = c;
        by[per][b._id].xp = x;
      }
      by[per].any.count += c;
      by[per].any.xp += x;
    }
  }

  const claimed = new Set(claims.map((c) => `${c.date}::${c.questId}`));

  // ── 내장 출석 퀘스트 — 음성 접속 누적 N분 달성 시 보상 (항상 일일) ──
  //    봇이 voiceIntervalSec 마다 음성 XP를 1건씩 기록하므로,
  //    오늘의 voice 로그 건수 × 간격(분) = 오늘 음성 접속 시간.
  const attendXp = setting?.attendXp ?? 7000;
  const targetMin = Math.max(1, setting?.attendVoiceMin ?? 60);
  const tickMin = Math.max(1, Math.round((setting?.voiceIntervalSec ?? 300) / 60));
  const voiceMin = by.daily.voice.count * tickMin;
  const attendDone = voiceMin >= targetMin;
  // 수령 여부는 QuestClaim이 아니라 lastAttendDate로 판정 — 봇의 출석 기록과 같은 자물쇠를 쓴다
  const attendClaimed = user?.lastAttendDate === kstToday();

  const attendQuest = {
    id: ATTEND_QUEST_ID,
    builtin: true,
    period: "daily",
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

  // ── 주기별 무작위 노출 ──
  const picks = {
    daily: setting?.questPickDaily || 0,
    weekly: setting?.questPickWeekly || 0,
    monthly: setting?.questPickMonthly || 0,
  };
  const grouped = { daily: [], weekly: [], monthly: [] };
  for (const q of quests) grouped[PERIODS.includes(q.period) ? q.period : "daily"].push(q);

  const pool = {};
  const selected = [];
  for (const per of PERIODS) {
    const all = grouped[per];
    const chosen = pickQuests(all, picks[per], `${per}:${keys[per]}`);
    // 뽑은 뒤 표시 순서는 관리자가 정한 order 그대로 되돌린다
    chosen.sort((a, b) => (a.order || 0) - (b.order || 0) || (String(a._id) < String(b._id) ? -1 : 1));
    pool[per] = { total: all.length, shown: chosen.length, pick: picks[per] };
    selected.push(...chosen);
  }

  const rows = selected.map((q) => {
    const per = PERIODS.includes(q.period) ? q.period : "daily";
    const src = by[per][q.reason] || by[per].any;
    const current = Math.min(q.metric === "xp" ? src.xp : src.count, q.target);
    const done = current >= q.target;
    const id = String(q._id);
    const isClaimed = claimed.has(`${keys[per]}::${id}`);
    return {
      id,
      builtin: false,
      period: per,
      name: q.name,
      desc: q.desc || "",
      reason: q.reason,
      metric: q.metric,
      target: q.target,
      rewardXp: q.rewardXp,
      current,
      done,
      claimed: isClaimed,
      // 보상이 0인 퀘스트는 '목표'일 뿐이라 수령 버튼을 띄우지 않는다
      claimable: done && q.rewardXp > 0 && !isClaimed,
    };
  });

  return {
    date: kstToday(),
    keys,
    voiceMin, // 오늘 음성 접속 누적 분 (UI 안내용)
    attendCount: user?.attendCount || 0,
    lastAttendDate: user?.lastAttendDate || "",
    // 주기별 등록 수/노출 수 — 화면에서 "오늘의 퀘스트 3개" 같은 안내에 쓴다
    pool,
    quests: [attendQuest, ...rows],
  };
}
