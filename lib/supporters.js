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

// ── 디스코드 역할 보유자 목록 (10분 캐시) ──────────────────────
//    관리자 표(/api/admin/supporters)와 공지 확인 현황(/api/admin/supporters/acks)이 같은 명단·같은 캐시를 써야
//    "전체 인원" 숫자가 화면마다 어긋나지 않는다.
//    작은 서버라 1,000명 한 페이지면 충분하지만, 넘치면 after 로 몇 장 더 넘긴다.
//    (List Guild Members 는 봇에 GUILD_MEMBERS 인텐트가 켜져 있어야 한다 — bot/src/index.js 에 이미 있다)
const MEMBER_TTL = 10 * 60 * 1000;
const MAX_PAGES = 5;
let memberCache = { at: 0, roleId: "", rows: [] };

export const defaultAvatar = (userId) => {
  // 디스코드 기본 아바타 — 새 유저명 체계는 (id >> 22) % 6 (leaderboard 와 같은 규칙)
  let n = 0;
  try { n = Number((BigInt(userId) >> 22n) % 6n); } catch { n = 0; }
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
};

// [{ userId, name, avatar }] — force 면 캐시를 무시한다
export async function fetchRoleHolders(roleId, force = false) {
  const now = Date.now();
  if (!force && memberCache.roleId === roleId && now - memberCache.at < MEMBER_TTL) return memberCache.rows;

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!GUILD_ID || !BOT_TOKEN) throw new Error("디스코드 설정(DISCORD_GUILD_ID / DISCORD_BOT_TOKEN)이 없습니다.");

  const rows = [];
  let after = "0";
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`디스코드 멤버 목록 조회 실패 (${res.status})`);
    const members = await res.json();
    if (!Array.isArray(members) || members.length === 0) break;

    for (const m of members) {
      const id = m?.user?.id;
      if (!id || !Array.isArray(m.roles) || !m.roles.includes(roleId)) continue;
      rows.push({
        userId: id,
        // 서버 별명 → 표시 이름 → 계정 이름 순
        name: m.nick || m.user.global_name || m.user.username || "",
        // 서버 전용 프로필 사진이 있으면 그것을 우선한다
        avatar: m.avatar
          ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${id}/avatars/${m.avatar}.png?size=128`
          : m.user.avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${m.user.avatar}.png?size=128`
          : defaultAvatar(id),
      });
    }
    if (members.length < 1000) break;
    after = members[members.length - 1].user.id;
  }

  memberCache = { at: now, roleId, rows };
  return rows;
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
