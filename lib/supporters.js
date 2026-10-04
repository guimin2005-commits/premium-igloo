// 📌 서포터즈 공용 — 월 경계(KST)·활동 집계·입장 판정을 한 곳에 모은다.
//    유저 화면(/api/supporters/me)과 관리자 표(/api/admin/supporters)가 반드시 같은 계산을 쓴다.
import { isAdminName } from "@/lib/admins";
import XpLog from "@/models/XpLog";
import ActivityStat from "@/models/ActivityStat";
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

// 📌 음성 분 = 음성 줄의 실제 초(XpLog.sec) 합 ÷ 60 — 2026-10-04 부터 봇이 사람마다 5분을 채우면 1회분, 못 채우고 나가면 머문 만큼 주므로
//    줄 수 × 주기로 세면 짧게 들락거린 줄이 5분씩 부풀려진다(lib/questKinds.js questMeasure 와 같은 계산). sec 칸이 없는 옛 줄은 전부 300초 주기였다
const VOICE_SEC = { $cond: [{ $eq: ["$reason", "voice"] }, { $ifNull: ["$sec", 300] }, 0] };

// 📌 채팅 = 실제 보낸 메시지 수 — 2026-10-04 "채팅은 실제 보낸 메시지 수로 셉니다(10/3부터 기록이 있어 그 전 달은 지금 방식)".
//    봇이 세는 메시지 수(ActivityStat k "msg" — 쿨타임 무관. 같은 사람이 3초 안에 연달아 보낸 것 · 지급 제외 채널은 봇이 세지 않는다,
//    bot/src/features/activityStats.js)를 쓴다. 그 기록이 없는 때(MSG_SINCE 전)는 예전처럼 XP 를 받은 채팅 줄 수(XpLog "chat" — 1분에 최대 1번)로 센다.
//    📌 경계는 10/4 00:00 KST — 봇의 메시지 집계는 10/3 밤(23:57 커밋 뒤 배포)에 켜져 10/3 은 거의 비어 있다.
//       10/3 부터 메시지 수로 세면 그날 채팅이 통째로 빠지므로, 켜진 다음 날부터 바꾼다. 경계가 낀 달(2026-10)은 날짜로 나눠 두 셈을 더한다
//       (10/1 ~ 10/3 = XP 채팅 줄 수, 10/4 ~ = 메시지 수).
//    📌 2026-10-04 #203 "지운 메시지는 뺌" — 봇이 센 메시지를 48시간 기억했다가 지워지면 그 줄에서 뺀다(bot/src/features/activityStats.js).
//       봇이 재시작하기 전에 센 메시지 · 48시간보다 오래된 메시지는 지워져도 빠지지 않는다(삭제 로그 봇 기록은 쓰지 않는다)
const MSG_SINCE = "2026-10-04"; // KST 날짜 "YYYY-MM-DD" — ActivityStat.d 와 같은 글자
const MSG_SINCE_AT = new Date(`${MSG_SINCE}T00:00:00+09:00`);
// XpLog 채팅 줄은 경계 전 것만 센다(경계 뒤는 메시지 수가 맡는다)
const CHAT_OLD = { $cond: [{ $and: [{ $eq: ["$reason", "chat"] }, { $lt: ["$createdAt", MSG_SINCE_AT] }] }, 1, 0] };
// 그 달에서 메시지 수로 셀 날짜 구간(ActivityStat.d) — 경계 전 달이면 null
const msgDays = (monthKey) => {
  const to = `${shiftMonthKey(monthKey, 1)}-01`;
  if (to <= MSG_SINCE) return null;
  const from = `${monthKey}-01`;
  return { $gte: from > MSG_SINCE ? from : MSG_SINCE, $lt: to };
};
// 메시지 수 — u 는 한 사람(글자) 또는 { $in: [...] }. byDay 면 날짜마다
const msgAgg = (u, days, byDay = false) =>
  ActivityStat.aggregate([
    { $match: { u, d: days, k: "msg" } },
    { $group: { _id: byDay ? { u: "$u", d: "$d" } : "$u", n: { $sum: "$n" } } },
  ]);

// 서포터즈 설정 묶음 — 역할 ID 는 환경변수가 우선 (세션 판정과 같은 규칙이어야 한다)
export async function getSupporterSettings() {
  const s = await BotSetting.findOne(
    { key: "main" },
    { supporterRoleId: 1, supporterBaseXp: 1, supporterGoalChat: 1, supporterGoalVoiceMin: 1 }
  ).lean();
  return {
    roleId: process.env.DISCORD_SUPPORTER_ROLE_ID || s?.supporterRoleId || "",
    baseXp: s?.supporterBaseXp ?? 150000,
    goals: { chat: s?.supporterGoalChat ?? 0, voiceMin: s?.supporterGoalVoiceMin ?? 0 },
  };
}

const zero = () => ({ chatCount: 0, voiceMin: 0 });

// 한 사람의 월간 활동 — { chatCount, voiceMin }
export async function getActivity(userId, monthKey) {
  if (!userId || !isMonthKey(monthKey)) return zero();
  const { start, end } = monthRangeKST(monthKey);
  const days = msgDays(monthKey);
  const [rows, msgs] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: "$reason", c: { $sum: CHAT_OLD }, s: { $sum: VOICE_SEC } } },
    ]),
    days ? msgAgg(userId, days) : [],
  ]);
  const out = zero();
  for (const r of rows) {
    if (r._id === "chat") out.chatCount += r.c || 0;
    else if (r._id === "voice") out.voiceMin = Math.floor((r.s || 0) / 60);
  }
  for (const m of msgs) out.chatCount += m.n || 0;
  return out;
}

// 한 사람의 이번 달 일별 활동 — [{ day, chat, voiceMin }] (1일부터 말일까지, 없는 날은 0).
//    화면의 막대 그래프용. 월간 집계와 같은 기록을 KST 날짜로 자른다 — 채팅은 합이 같고(경계 전 날은 XpLog, 그 뒤는 메시지 수),
//    음성 분은 날마다 내림이라 합이 월간보다 하루 1분 안쪽씩 작을 수 있다.
export async function getActivityDaily(userId, monthKey) {
  if (!userId || !isMonthKey(monthKey)) return [];
  const { start, end } = monthRangeKST(monthKey);
  const msgRange = msgDays(monthKey);
  const [rows, msgs] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: { day: { $dateToString: { format: "%d", date: "$createdAt", timezone: "Asia/Seoul" } }, reason: "$reason" },
          c: { $sum: CHAT_OLD },
          s: { $sum: VOICE_SEC },
        },
      },
    ]),
    msgRange ? msgAgg(userId, msgRange, true) : [],
  ]);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  const out = Array.from({ length: days }, (_, i) => ({ day: i + 1, chat: 0, voiceMin: 0 }));
  for (const r of rows) {
    const d = Number(r._id.day);
    if (!(d >= 1 && d <= days)) continue;
    if (r._id.reason === "chat") out[d - 1].chat += r.c || 0;
    else if (r._id.reason === "voice") out[d - 1].voiceMin += Math.floor((r.s || 0) / 60);
  }
  for (const m of msgs) {
    const d = Number(String(m._id?.d || "").slice(8, 10));
    if (d >= 1 && d <= days) out[d - 1].chat += m.n || 0;
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
export async function getActivityMany(userIds, monthKey) {
  const out = new Map();
  for (const id of userIds) out.set(id, zero());
  if (!userIds.length || !isMonthKey(monthKey)) return out;
  const { start, end } = monthRangeKST(monthKey);
  const days = msgDays(monthKey);
  const [rows, msgs] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId: { $in: userIds }, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { userId: "$userId", reason: "$reason" }, c: { $sum: CHAT_OLD }, s: { $sum: VOICE_SEC } } },
    ]),
    days ? msgAgg({ $in: userIds }, days) : [],
  ]);
  for (const r of rows) {
    const a = out.get(r._id.userId);
    if (!a) continue;
    if (r._id.reason === "chat") a.chatCount += r.c || 0;
    else if (r._id.reason === "voice") a.voiceMin = Math.floor((r.s || 0) / 60);
  }
  for (const m of msgs) {
    const a = out.get(m._id);
    if (a) a.chatCount += m.n || 0;
  }
  return out;
}
