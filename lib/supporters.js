// 📌 서포터즈 공용 — 월 경계(KST)·활동 집계·입장 판정을 한 곳에 모은다.
//    유저 화면(/api/supporters/me)과 관리자 표(/api/admin/supporters)가 반드시 같은 계산을 쓴다.
import { isAdminName } from "@/lib/admins";
import XpLog from "@/models/XpLog";
import BotSetting from "@/models/BotSetting";

const KST = 9 * 60 * 60 * 1000;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonthKey = (key) => typeof key === "string" && MONTH_KEY.test(key);

// KST 기준 "YYYY-MM"
export const monthKeyKST = (date = new Date()) => new Date(date.getTime() + KST).toISOString().slice(0, 7);

// 해당 월의 [start, end) — KST 1일 00:00 을 UTC Date 로
export const monthRangeKST = (key) => {
  const [y, m] = key.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - KST),
    end: new Date(Date.UTC(y, m, 1) - KST),
  };
};

// 한 달 앞·뒤 키
export const shiftMonthKey = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};
export const prevMonthKey = (key) => shiftMonthKey(key, -1);

// 서포터즈 입장 — 역할 보유자, 그리고 관리자는 운영 확인용으로 항상 통과
export const isSupporterSession = (session) =>
  !!session?.user?.isSupporter || isAdminName(session?.user?.name);

// 음성 로그 1건 = 이 분(分). 봇이 voiceIntervalSec 마다 1건씩 기록한다 (lib/quests.js 와 같은 계산)
const tickMinOf = (setting) => Math.max(1, Math.round((setting?.voiceIntervalSec ?? 300) / 60));

// 서포터즈 설정 묶음 — 역할 ID 는 환경변수가 우선 (세션 판정과 같은 규칙이어야 한다)
export async function getSupporterSettings() {
  const s = await BotSetting.findOne(
    { key: "main" },
    { supporterRoleId: 1, supporterBaseXp: 1, supporterGoalChat: 1, supporterGoalVoiceMin: 1, voiceIntervalSec: 1 }
  ).lean();
  return {
    roleId: process.env.DISCORD_SUPPORTER_ROLE_ID || s?.supporterRoleId || "",
    baseXp: s?.supporterBaseXp ?? 150000,
    goals: { chat: s?.supporterGoalChat ?? 0, voiceMin: s?.supporterGoalVoiceMin ?? 0 },
    tickMin: tickMinOf(s),
  };
}

const zero = () => ({ chatCount: 0, voiceMin: 0 });

// 한 사람의 월간 활동 — { chatCount, voiceMin }. tickMin 을 넘기면 설정 조회를 건너뛴다
export async function getActivity(userId, monthKey, tickMin) {
  if (!userId || !isMonthKey(monthKey)) return zero();
  const { start, end } = monthRangeKST(monthKey);
  const [rows, tick] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: "$reason", n: { $sum: 1 } } },
    ]),
    tickMin ? Promise.resolve(tickMin) : getSupporterSettings().then((s) => s.tickMin),
  ]);
  const out = zero();
  for (const r of rows) {
    if (r._id === "chat") out.chatCount = r.n;
    else if (r._id === "voice") out.voiceMin = r.n * tick;
  }
  return out;
}

// 한 사람의 이번 달 일별 활동 — [{ day, chat, voiceMin }] (1일부터 말일까지, 없는 날은 0).
//    화면의 막대 그래프용. 월간 집계와 같은 로그를 KST 날짜로 자르므로 합계가 어긋나지 않는다.
export async function getActivityDaily(userId, monthKey, tickMin) {
  if (!userId || !isMonthKey(monthKey)) return [];
  const { start, end } = monthRangeKST(monthKey);
  const [rows, tick] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: { day: { $dateToString: { format: "%d", date: "$createdAt", timezone: "Asia/Seoul" } }, reason: "$reason" },
          n: { $sum: 1 },
        },
      },
    ]),
    tickMin ? Promise.resolve(tickMin) : getSupporterSettings().then((s) => s.tickMin),
  ]);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  const out = Array.from({ length: days }, (_, i) => ({ day: i + 1, chat: 0, voiceMin: 0 }));
  for (const r of rows) {
    const d = Number(r._id.day);
    if (!(d >= 1 && d <= days)) continue;
    if (r._id.reason === "chat") out[d - 1].chat += r.n;
    else if (r._id.reason === "voice") out[d - 1].voiceMin += r.n * tick;
  }
  return out;
}

// 여러 사람을 한 번에 — 관리자 표에서 N+1 을 막는다. Map<userId, { chatCount, voiceMin }> (없는 사람은 0)
export async function getActivityMany(userIds, monthKey, tickMin) {
  const out = new Map();
  for (const id of userIds) out.set(id, zero());
  if (!userIds.length || !isMonthKey(monthKey)) return out;
  const { start, end } = monthRangeKST(monthKey);
  const [rows, tick] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId: { $in: userIds }, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { userId: "$userId", reason: "$reason" }, n: { $sum: 1 } } },
    ]),
    tickMin ? Promise.resolve(tickMin) : getSupporterSettings().then((s) => s.tickMin),
  ]);
  for (const r of rows) {
    const a = out.get(r._id.userId);
    if (!a) continue;
    if (r._id.reason === "chat") a.chatCount = r.n;
    else if (r._id.reason === "voice") a.voiceMin = r.n * tick;
  }
  return out;
}
