export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import UserXp from "@/models/UserXp";
import XpLog from "@/models/XpLog";
import { kstMonthStart } from "@/lib/kst";

// 📌 디스코드 멤버 정보 — 프로필 사진과 표시 이름을 함께 가져온다.
//    사진은 시상대(1~3위)에만, 이름은 UserXp 에 비어 있는 사람에게만 쓴다.
//    (봇의 grantXp 를 거치지 않고 XP 만 들어간 계정은 이름이 비어 있다)
const AVATAR_TTL = 10 * 60 * 1000;
let avatarCache = { at: 0, byUser: new Map() };

const defaultAvatar = (userId) => {
  // 디스코드 기본 아바타 — 새 유저명 체계는 (id >> 22) % 6
  let n = 0;
  try { n = Number((BigInt(userId) >> 22n) % 6n); } catch { n = 0; }
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
};

async function fetchMembers(userIds) {
  const now = Date.now();
  if (now - avatarCache.at > AVATAR_TTL) avatarCache = { at: now, byUser: new Map() };

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const out = new Map();

  await Promise.all(
    userIds.map(async (id) => {
      if (avatarCache.byUser.has(id)) { out.set(id, avatarCache.byUser.get(id)); return; }
      const fallback = { avatar: defaultAvatar(id), name: "" };
      if (!GUILD_ID || !BOT_TOKEN) { out.set(id, fallback); return; }
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${id}`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` },
          cache: "no-store",
        });
        if (!res.ok) { out.set(id, fallback); return; }
        const m = await res.json();
        // 서버 전용 프로필 사진이 있으면 그것을 우선한다
        const avatar = m?.avatar
          ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${id}/avatars/${m.avatar}.png?size=128`
          : m?.user?.avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${m.user.avatar}.png?size=128`
          : defaultAvatar(id);
        // 서버 별명 → 표시 이름 → 계정 이름 순
        const name = m?.nick || m?.user?.global_name || m?.user?.username || "";
        const info = { avatar, name };
        avatarCache.byUser.set(id, info);
        out.set(id, info);
      } catch {
        out.set(id, fallback);
      }
    })
  );
  return out;
}

// 사진은 첫 페이지 상위 3명(시상대)에만, 이름은 비어 있는 사람 전부에게 채운다.
const NO_NAME = "이름 없음";
async function decorate(rows, skip) {
  const needAvatar = skip === 0 ? rows.slice(0, 3).map((r) => r.userId) : [];
  const needName = rows.filter((r) => !r.name || r.name === NO_NAME).map((r) => r.userId);
  const ids = [...new Set([...needAvatar, ...needName])];
  if (ids.length === 0) return rows;
  const map = await fetchMembers(ids);
  const avatarSet = new Set(needAvatar);
  return rows.map((r) => {
    const info = map.get(r.userId);
    if (!info) return r;
    const out = { ...r };
    if (avatarSet.has(r.userId)) out.avatar = info.avatar;
    if ((!r.name || r.name === NO_NAME) && info.name) out.name = info.name;
    return out;
  });
}

// ── [조회] 랭킹 ──────────────────────────────────────────────
//   period=all   누적 XP        (UserXp.xp)
//   period=month 이번 달 획득   (XpLog 합산 — 봇 가동 이후분만 잡힌다)
//   period=voice 누적 음성 시간 (UserXp.voiceSeconds — 시즌 2 개시일부터 적립)
//   skip/limit 으로 페이지를 넘긴다. 순위는 skip 을 더해 이어진다.
export async function GET(request) {
  try {
    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50));
    const skip = Math.max(0, parseInt(sp.get("skip") || "0", 10) || 0);
    const raw = sp.get("period");
    const period = raw === "month" || raw === "voice" ? raw : "all";

    if (period === "month") {
      const monthStart = kstMonthStart();
      // 이번 달 지급 로그를 유저별로 합산한 뒤 잘라 낸다.
      // 총원은 자른 뒤 길이가 아니라 그룹 수 전체여야 페이지 수가 맞는다.
      const [rows, countRows] = await Promise.all([
        XpLog.aggregate([
          { $match: { createdAt: { $gte: monthStart } } },
          { $group: { _id: "$userId", xp: { $sum: "$amount" }, displayName: { $last: "$displayName" } } },
          { $sort: { xp: -1, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
        ]),
        XpLog.aggregate([
          { $match: { createdAt: { $gte: monthStart } } },
          { $group: { _id: "$userId" } },
          { $count: "n" },
        ]),
      ]);

      // 현재 레벨·이름은 누적 문서에서 채워 넣는다
      const docs = await UserXp.find(
        { userId: { $in: rows.map((r) => r._id) } },
        { userId: 1, level: 1, displayName: 1 }
      ).lean();
      const byId = new Map(docs.map((u) => [u.userId, u]));

      const monthData = await decorate(
        rows.map((r, i) => ({
          rank: skip + i + 1,
          userId: r._id,
          name: byId.get(r._id)?.displayName || r.displayName || "이름 없음",
          xp: r.xp,
          level: byId.get(r._id)?.level ?? 0,
        })),
        skip
      );
      return NextResponse.json({ success: true, period, monthStart, data: monthData, total: countRows[0]?.n || 0 });
    }

    if (period === "voice") {
      // 음성 시간은 시즌 2 개시일부터 쌓이므로 그 전에는 전원 0이다.
      // 0인 사람까지 줄 세우면 순위가 의미 없으므로 1초라도 있는 사람만 센다.
      const filter = { voiceSeconds: { $gt: 0 } };
      const [rows, total] = await Promise.all([
        UserXp.find(filter, { userId: 1, displayName: 1, username: 1, level: 1, voiceSeconds: 1 })
          .sort({ voiceSeconds: -1, userId: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserXp.countDocuments(filter),
      ]);

      const voiceData = await decorate(
        rows.map((r, i) => ({
          rank: skip + i + 1,
          userId: r.userId,
          name: r.displayName || r.username || "이름 없음",
          level: r.level,
          voiceSeconds: r.voiceSeconds || 0,
        })),
        skip
      );
      return NextResponse.json({ success: true, period, data: voiceData, total });
    }

    const [rows, total] = await Promise.all([
      UserXp.find({}, { userId: 1, displayName: 1, username: 1, xp: 1, level: 1, attendCount: 1 })
        .sort({ xp: -1, userId: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserXp.countDocuments(),
    ]);

    const allData = await decorate(
      rows.map((r, i) => ({
        rank: skip + i + 1,
        userId: r.userId,
        name: r.displayName || r.username || "이름 없음",
        xp: r.xp,
        level: r.level,
        attendCount: r.attendCount || 0,
      })),
      skip
    );
    return NextResponse.json({ success: true, period, data: allData, total });
  } catch (e) {
    console.error("리더보드 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], total: 0 }, { status: 500 });
  }
}
