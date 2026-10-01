export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import UserXp from "@/models/UserXp";
import XpLog from "@/models/XpLog";
import Payout from "@/models/Payout";
import { kstMonthStart } from "@/lib/kst";
import { requireAdmin } from "@/lib/apiAuth";
import BotSetting from "@/models/BotSetting";
import { fetchGuildMember } from "@/lib/discordMember";
import { badgesOfUsers } from "@/lib/itemPerks";

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
        // 멤버 조회는 공용 캐시(lib/discordMember.js) — 세션 · 인벤토리와 같은 조회가 한꺼번에 몰려 429 가 나지 않게
        const r = await fetchGuildMember(id);
        if (r.status !== "ok") { out.set(id, fallback); return; }
        const m = r.member;
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

// 📌 이름 옆 프로필 배지(최대 3) — 쪽 전체를 한 번에 모아 계산한다(lib/itemPerks badgesOfUsers · 구매 기록 기준 보유).
//    사진 · 이름 채우기(decorate)와 함께 돌리고, 배지 계산이 실패해도 랭킹은 그대로 보낸다
async function finish(rows, skip) {
  const [out, badgeMap] = await Promise.all([
    decorate(rows, skip),
    badgesOfUsers(rows.map((r) => r.userId)).catch((e) => {
      console.error("랭킹 배지 계산 오류:", e?.message || e);
      return null;
    }),
  ]);
  if (!badgeMap?.size) return out;
  return out.map((r) => (badgeMap.has(r.userId) ? { ...r, badges: badgeMap.get(r.userId) } : r));
}

// 📌 관리자가 없앤 XP — [XP 제거] · 음수 수동 지급(app/api/xp/grant → 봇 processPayouts 가 반영해 paid) · 관리자 초기화(같은 라우트 mode reset).
//    누적(UserXp.xp)은 봇 · 초기화가 이미 깎는다. 이번 달은 XpLog 합이라 여기서 따로 뺀다.
//    XpLog 에 음수 줄을 쓰지 않는다 — 원장(app/api/xp/ledger)에 Payout 줄과 두 번 보이고, 퀘스트 · 패스 · 서포터즈도 XpLog 를 같이 센다.
//    유저가 쓴 XP(상점 결제 · 강화 · 패스 해금)와 다른 지급은 빼지 않는다 — 대기 · 처리 중은 아직 깎이지 않았으므로 paid 만
//    초기화는 kind "reset", 그 표시가 없던 예전 기록은 수동 지급 중 사유 "관리자 초기화…"(원장 HIDDEN_PAYOUT 과 같은 기준). 보유 0 이던 사람의 기록은 금액 0 이라 따로 잡는다
const ADMIN_TAKE = [
  { source: { $in: ["manual", "admin"] }, amount: { $lt: 0 } },
  { kind: "reset" },
  { source: "manual", reason: /^관리자 초기화/ },
];
const IS_RESET = {
  $and: [
    { $lte: ["$amount", 0] },
    {
      $or: [
        { $eq: ["$kind", "reset"] },
        { $and: [{ $eq: ["$source", "manual"] }, { $regexMatch: { input: { $ifNull: ["$reason", ""] }, regex: "^관리자 초기화" } }] },
      ],
    },
  ],
};

// 📌 이번 달 값에서 관리자 회수분 빼기 — 시각 순으로 쌓다가 0 아래로는 내리지 않는다
//    (이번 달에 번 것보다 많이 없애도 0 까지만 — 그 뒤에 번 XP 는 다시 쌓인다. 보유 XP 가 0 에서 멈추는 것과 같다)
//    📌 이번 달 값에 처음부터 없는 XP — 양수 XP 지급(관리자 지급 · 패스 · 퀘스트 · 쿠폰 · 서포터즈 · 역할 환불).
//       봇 processPayouts 는 UserXp.xp 만 올리고 XpLog 를 쓰지 않는다. 그 몫(u)을 따로 쌓아 두고 회수는 u 에서 먼저 뺀다 —
//       잘못 준 XP 를 [XP 제거]로 되돌려도 채팅 · 음성으로 번 이번 달 XP 는 깎이지 않는다. u 를 넘는 만큼만 이번 달 값(v)에서 뺀다
//    📌 초기화는 금액과 상관없이 그 순간까지의 v · u 를 둘 다 0 으로 — 보유 XP 를 통째로 지운 것이라 이번 달에 번 것도 남지 않는다
//    0 이 된 사람은 이번 달 순위에서 빠진다. 반환 null = 회수 기록 없음(예전 계산 그대로)
async function monthCuts(monthStart) {
  const cuts = await Payout.aggregate([
    {
      $match: {
        userId: { $nin: ["", null] },
        status: "paid",
        currency: { $ne: "point" },
        $and: [
          { $or: [{ paidAt: { $gte: monthStart } }, { createdAt: { $gte: monthStart } }] },
          { $or: [{ amount: { $gt: 0 } }, ...ADMIN_TAKE] },
        ],
      },
    },
    { $addFields: { at: { $ifNull: ["$paidAt", "$createdAt"] } } },
    { $match: { at: { $gte: monthStart } } },
    { $sort: { at: 1, _id: 1 } },
    {
      $group: {
        _id: "$userId",
        at: { $push: "$at" },
        amt: { $push: "$amount" },
        reset: { $push: IS_RESET },
        takes: { $sum: { $cond: [{ $lte: ["$amount", 0] }, 1, 0] } },
      },
    },
    // 양수 지급만 있는 사람은 그대로 — 회수 · 초기화가 한 번이라도 있는 사람만 다시 센다
    { $match: { takes: { $gt: 0 } } },
  ]);
  if (!cuts.length) return null;

  // 지급 · 회수 시각으로 이번 달 XpLog 를 구간별로 나눠 합한다 — 구간 번호 = 그 로그 시각까지 지난 지급 · 회수 수
  const users = cuts.map((c) => c._id);
  const times = cuts.map((c) => c.at);
  const segs = await XpLog.aggregate([
    { $match: { userId: { $in: users }, createdAt: { $gte: monthStart } } },
    {
      $group: {
        _id: {
          u: "$userId",
          s: {
            $size: {
              $filter: {
                input: { $arrayElemAt: [{ $literal: times }, { $indexOfArray: [{ $literal: users }, "$userId"] }] },
                as: "t",
                cond: { $lte: ["$$t", "$createdAt"] },
              },
            },
          },
        },
        xp: { $sum: "$amount" },
      },
    },
  ]);
  const segBy = new Map();
  for (const r of segs) {
    if (!segBy.has(r._id.u)) segBy.set(r._id.u, new Map());
    segBy.get(r._id.u).set(r._id.s, r.xp);
  }

  const ids = [];
  const deltas = [];
  const zero = [];
  for (const c of cuts) {
    const sums = segBy.get(c._id);
    if (!sums) continue; // 이번 달에 번 XP 가 없다 — 원래도 이번 달 순위에 없다
    let v = 0; // 이번 달 값(회수 반영)
    let u = 0; // 이번 달 값에 없는 지급 중 아직 회수되지 않은 몫
    let plain = 0; // 예전 계산(XpLog 합)
    for (let i = 0; i <= c.amt.length; i++) {
      const s = sums.get(i) || 0;
      v += s;
      plain += s;
      if (i === c.amt.length) break;
      const a = c.amt[i];
      if (c.reset[i]) { v = 0; u = 0; }
      else if (a > 0) u += a;
      else {
        const take = Math.min(u, -a);
        u -= take;
        v = Math.max(0, v + a + take);
      }
    }
    if (v <= 0) zero.push(c._id);
    else if (v !== plain) { ids.push(c._id); deltas.push(v - plain); }
  }
  return { ids, deltas, zero };
}

// 이번 달 묶음($group 뒤)에 끼울 단계 — 0 이 된 사람은 빼고, 깎인 사람은 그만큼 낮춘다
const cutStages = (cut, withXp) => {
  if (!cut) return [];
  const st = [];
  if (cut.zero.length) st.push({ $match: { _id: { $nin: cut.zero } } });
  if (withXp && cut.ids.length) {
    st.push({
      $addFields: {
        xp: {
          $add: [
            "$xp",
            {
              $let: {
                vars: { i: { $indexOfArray: [{ $literal: cut.ids }, "$_id"] } },
                in: { $cond: [{ $gte: ["$$i", 0] }, { $arrayElemAt: [{ $literal: cut.deltas }, "$$i"] }, 0] },
              },
            },
          ],
        },
      },
    });
  }
  return st;
};

// ── [조회] 랭킹 ──────────────────────────────────────────────
//   period=all   누적 XP        (UserXp.xp — 관리자 회수 · 초기화는 이미 빠져 있다)
//   period=month 이번 달 획득   (XpLog 합산 − 이번 달 관리자 회수 · 초기화(monthCuts) — 봇 가동 이후분만 잡힌다)
//   period=voice 누적 음성 시간 (UserXp.voiceSeconds — 시즌 2 개시일부터 적립)
//   skip/limit 으로 페이지를 넘긴다. 순위는 skip 을 더해 이어진다.
export async function GET(request) {
  try {
    await connectToDatabase();
    // SYSTEM : LEVEL 비공개 동안은 전원 순위를 밖으로 내보내지 않는다 (화면만 가리면 API 로 새어 나간다)
    const gate = await BotSetting.findOne({ key: "main" }, { levelPublic: 1 }).lean();
    if (!gate?.levelPublic && (await requireAdmin()).deny) {
      return NextResponse.json({ success: false, data: [], total: 0, message: "공개 전입니다." }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50));
    const skip = Math.max(0, parseInt(sp.get("skip") || "0", 10) || 0);
    const raw = sp.get("period");
    const period = raw === "month" || raw === "voice" ? raw : "all";

    if (period === "month") {
      const monthStart = kstMonthStart();
      // 이번 달 지급 로그를 유저별로 합산한 뒤(관리자 회수분은 뺀 뒤) 잘라 낸다.
      // 총원은 자른 뒤 길이가 아니라 그룹 수 전체여야 페이지 수가 맞는다.
      const cut = await monthCuts(monthStart);
      const [rows, countRows] = await Promise.all([
        XpLog.aggregate([
          { $match: { createdAt: { $gte: monthStart } } },
          { $group: { _id: "$userId", xp: { $sum: "$amount" }, displayName: { $last: "$displayName" } } },
          ...cutStages(cut, true),
          { $sort: { xp: -1, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
        ]),
        XpLog.aggregate([
          { $match: { createdAt: { $gte: monthStart } } },
          { $group: { _id: "$userId" } },
          ...cutStages(cut, false),
          { $count: "n" },
        ]),
      ]);

      // 현재 레벨·이름은 누적 문서에서 채워 넣는다
      const docs = await UserXp.find(
        { userId: { $in: rows.map((r) => r._id) } },
        { userId: 1, level: 1, displayName: 1 }
      ).lean();
      const byId = new Map(docs.map((u) => [u.userId, u]));

      const monthData = await finish(
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

      const voiceData = await finish(
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

    const allData = await finish(
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
