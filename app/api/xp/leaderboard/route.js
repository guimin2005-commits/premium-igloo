export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import UserXp from "@/models/UserXp";
import XpLog from "@/models/XpLog";
import Payout from "@/models/Payout";
import Purchase from "@/models/Purchase";
import WalletLog from "@/models/WalletLog";
import { kstMonthStart } from "@/lib/kst";
import { currentSeason, seasonStartMs } from "@/lib/season";
import { requireAdmin, getSession } from "@/lib/apiAuth";
import BotSetting from "@/models/BotSetting";
import { fetchGuildMember } from "@/lib/discordMember";
import { badgesOfUsers, framesOfUsers } from "@/lib/itemPerks";

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
//    📌 시상대(첫 쪽 1~3위)는 낀 아바타 테두리(avatarFrame)도 — lib/itemPerks framesOfUsers. 실패해도 테두리만 빠진다
async function finish(rows, skip) {
  const [out, badgeMap, frameMap] = await Promise.all([
    decorate(rows, skip),
    badgesOfUsers(rows.map((r) => r.userId)).catch((e) => {
      console.error("랭킹 배지 계산 오류:", e?.message || e);
      return null;
    }),
    skip === 0
      ? framesOfUsers(rows.slice(0, 3).map((r) => r.userId)).catch((e) => {
          console.error("랭킹 테두리 계산 오류:", e?.message || e);
          return null;
        })
      : null,
  ]);
  if (!badgeMap?.size && !frameMap?.size) return out;
  return out.map((r) => {
    const badges = badgeMap?.get(r.userId), avatarFrame = frameMap?.get(r.userId);
    return badges || avatarFrame ? { ...r, ...(badges ? { badges } : {}), ...(avatarFrame ? { avatarFrame } : {}) } : r;
  });
}

// 📌 관리자가 없앤 XP — [XP 제거] · 음수 수동 지급(app/api/xp/grant → 봇 processPayouts 가 반영해 paid) · 관리자 초기화(같은 라우트 mode reset).
//    현재(UserXp.xp)는 봇 · 초기화가 이미 깎는다. 이번 달은 XpLog + 지급 합이라 여기서 따로 뺀다(monthBoard).
//    XpLog 에 음수 줄을 쓰지 않는다 — 원장(app/api/xp/ledger)에 Payout 줄과 두 번 보이고, 퀘스트 · 패스 · 서포터즈도 XpLog 를 같이 센다.
//    유저가 쓴 XP(상점 결제 · 강화 · 패스 해금)와 다른 지급은 빼지 않는다 — 대기 · 처리 중은 아직 깎이지 않았으므로 paid 만
//    초기화는 kind "reset", 그 표시가 없던 예전 기록은 수동 지급 중 사유 "관리자 초기화…"(원장 HIDDEN_PAYOUT 과 같은 기준). 보유 0 이던 사람의 기록은 금액 0 이라 따로 잡는다
//    📌 2026-10-04 퇴장 초기화(봇 features/leaveReset.js)도 kind "reset" 을 남긴다 — 금액 0 · source "etc" · by "bot" · paid, 나간 시각.
//       kind "reset" 은 금액 부호와 상관없이 '그 시각까지 0'이고 획득(plus)에 넣지 않는다. 사유로만 잡는 예전 기록은 금액 0 이하일 때만 초기화
const ADMIN_TAKE = [
  { source: { $in: ["manual", "admin"] }, amount: { $lt: 0 } },
  { kind: "reset" },
  { source: "manual", reason: /^관리자 초기화/ },
];
const IS_RESET = {
  $or: [
    { $eq: ["$kind", "reset"] },
    {
      $and: [
        { $lte: ["$amount", 0] },
        { $eq: ["$source", "manual"] },
        { $regexMatch: { input: { $ifNull: ["$reason", ""] }, regex: "^관리자 초기화" } },
      ],
    },
  ],
};

// 📌 이번 달 값 — 이번 달 XpLog(채팅 · 음성 · 출석 · 아이템 효과) + 이번 달 지급된(paid) 양수 XP 지급
//    (퀘스트 · 시즌 패스 · 관리자 지급 · 쿠폰 · 서포터즈 · 역할 환불 — 봇 processPayouts 는 UserXp.xp 만 올리고 XpLog 를 쓰지 않는다)
//    − 관리자 회수 · 초기화. 유저가 쓴 XP(상점 결제 · 강화 · 패스 해금)는 Payout 이 아니라 빼지 않는다.
//    시각 순으로 쌓는다: 회수는 0 아래로 내리지 않고(그 뒤에 번 XP 는 다시 쌓인다 — 보유 XP 가 0 에서 멈추는 것과 같다),
//    초기화(관리자 · 퇴장)는 금액과 상관없이 그 순간까지를 0 으로(보유 XP 를 통째로 지운 것 — 같은 달에 다시 들어와도 나가기 전 몫은 안 잡힌다).
//    📌 "회수는 그 달 지급분에서 먼저"(2ffb4b2)와 같은 값이다 — 지급분 u · 번 값 v 로 나눠 u 부터 깎아도 합(u + v)은 max(0, 합 − 회수)라
//       지급까지 더하는 지금은 한 값으로 센다(잘못 준 지급을 [XP 제거]로 되돌리면 그 지급이 빠질 뿐 채팅 · 음성으로 번 몫은 그대로).
//    집계는 XpLog 1번 + Payout 1번 + (회수 · 초기화가 있는 사람만) 구간별 XpLog 1번.
//    반환: [{ userId, xp, displayName }] — xp 내림차순 · userId 오름차순, 0 이하는 빠진다(이번 달 순위에 없음)
async function monthBoard(monthStart) {
  const [logs, pays] = await Promise.all([
    XpLog.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: "$userId", xp: { $sum: "$amount" }, displayName: { $last: "$displayName" } } },
    ]),
    Payout.aggregate([
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
          plus: { $sum: { $cond: [{ $and: [{ $gt: ["$amount", 0] }, { $not: [IS_RESET] }] }, "$amount", 0] } },
          takes: { $sum: { $cond: [{ $or: [{ $lte: ["$amount", 0] }, IS_RESET] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const byUser = new Map(); // userId → { xp, displayName }
  for (const l of logs) {
    if (!l._id) continue;
    byUser.set(l._id, { xp: l.xp || 0, displayName: l.displayName || "" });
  }
  // 양수 지급만 있는 사람 — 이번 달 로그 합에 지급 합을 더하면 끝
  for (const p of pays) {
    if (p.takes > 0) continue;
    const cur = byUser.get(p._id);
    byUser.set(p._id, { xp: (cur?.xp || 0) + p.plus, displayName: cur?.displayName || "" });
  }

  // 회수 · 초기화가 한 번이라도 있는 사람 — 지급 · 회수 시각으로 이번 달 XpLog 를 구간별로 나눠 합한 뒤 시각 순으로 쌓는다.
  //    구간 번호 = 그 로그 시각까지 지난 지급 · 회수 수(같은 시각의 로그는 그 지급 · 회수 뒤로 친다)
  const cuts = pays.filter((p) => p.takes > 0);
  if (cuts.length) {
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
    for (const c of cuts) {
      const sums = segBy.get(c._id);
      let t = 0;
      for (let i = 0; i <= c.amt.length; i++) {
        t += sums?.get(i) || 0;
        if (i === c.amt.length) break;
        const a = c.amt[i];
        if (c.reset[i]) t = 0;
        else if (a > 0) t += a;
        else t = Math.max(0, t + a);
      }
      byUser.set(c._id, { xp: t, displayName: byUser.get(c._id)?.displayName || "" });
    }
  }

  return [...byUser]
    .map(([userId, v]) => ({ userId, xp: v.xp, displayName: v.displayName }))
    .filter((r) => r.xp > 0)
    // 동점은 userId 오름차순 — 현재 · 음성(Mongo sort userId:1)과 같은 규칙(글자 비교 — Mongo 정렬 · $lt 와 같은 순서, 가입 순서 아님)
    // 📌 2026-10-04 "규칙 하나로 맞추면, 같은 사람이 화면마다 다른 순위로 보이는 일이 없습니다" — 내 정보(app/api/xp/me) · 봇 /레벨 · /랭크도 이 규칙
    .sort((a, b) => b.xp - a.xp || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

// 📌 누적(period=total) — 이번 시즌 동안 얻은 XP 전부 = 지금 보유 XP(UserXp.xp) + 이번 시즌에 유저가 쓴 XP.
//    쓴 XP = 상점 결제 · 연장(Purchase, createdAt) − 취소 · 환불로 돌려받은 XP(revokedAt → processedAt → createdAt)
//            + 강화 · 패스 해금 비용(WalletLog enhance · pass-unlock 의 XP 쪽).
//    낸 값 식(hasSplit · 옛 건은 정가를 XP 로) · 테스트 초기화 환불 제외는 원장(app/api/xp/ledger) · 재화 통계(lib/adminEconomy)와 같다 —
//    빙옥으로 낸 몫은 XP 가 아니라 빠진다. ⚠ 원장 쪽 식을 바꾸면 여기도 같이 바꾼다.
//    관리자 회수 · 캐시백 회수는 더하지 않는다 — 보유 XP 에서 빠진 그대로 누적에서도 빠진다(10/1 결정).
//    세는 구간: 시즌 시작(lib/season)과 내역 기준 시각(BotSetting.ledgerSince) 중 늦은 쪽부터.
//    초기화(관리자 · 퇴장 — Payout kind "reset")가 있었던 사람은 마지막 초기화 시각부터, 퇴장 초기화로 문서가 다시 생긴 사람은 그 생성 시각부터(늦은 쪽) —
//    초기화가 보유 XP 를 통째로 지웠으므로 그 전에 쓴 것은 지금 값에 없다. 초기화 기록은 시작 시각으로만 쓰고 얻은 XP 에 더하지 않는다.
//    📌 검산: 전원 합 = 구간 안 발행(XpLog + 양수 지급 + 캐시백) − 관리자 회수 · 캐시백 회수 — 구간 시작 때 보유가 0 이고 구간 안 초기화가 없으면 같은 값(10/3 실측 차이 0)
//    집계는 Payout 1번(초기화 시각) + UserXp 2번(구간 안 생성 · 보유) + Purchase 2번 + WalletLog 1번, 30초 메모리 캐시.
//    반환: [{ userId, xp(누적), name, level, attendCount }] — xp 내림차순 · userId 오름차순, 0 이하는 빠진다
const TOTAL_TTL = 30 * 1000;
let totalCache = { at: 0, key: "", board: null };

// 초기화 기록 — 원장 HIDDEN_PAYOUT 과 같은 두 표시. kind "reset" 은 금액과 상관없이, 사유로만 잡는 예전 기록은 금액 0 이하만(monthBoard IS_RESET 과 같다)
const RESET_PAYOUT = [{ kind: "reset" }, { source: "manual", reason: /^관리자 초기화/, amount: { $lte: 0 } }];
const hasSplit = {
  $or: [
    { $eq: ["$billed", true] },
    { $gt: [{ $ifNull: ["$paidXp", 0] }, 0] },
    { $gt: [{ $ifNull: ["$paidPoint", 0] }, 0] },
  ],
};
const paidXpOf = { $cond: [hasSplit, { $ifNull: ["$paidXp", 0] }, { $ifNull: ["$price", 0] }] };
const TEST_RESET = { adminNote: "관리자 테스트 초기화", billed: { $ne: true } };
const SPEND_KINDS = ["enhance", "pass-unlock"];

// 구간 시작 — 시즌 시작과 내역 기준 시각 중 늦은 쪽
function totalSince(ledgerSince) {
  const season = new Date(seasonStartMs(currentSeason()));
  const floor = ledgerSince ? new Date(ledgerSince) : null;
  return floor && !Number.isNaN(floor.getTime()) && floor > season ? floor : season;
}

async function totalBoard(since) {
  const key = since.toISOString();
  if (totalCache.board && totalCache.key === key && Date.now() - totalCache.at < TOTAL_TTL) return totalCache.board;

  // 1) 사람마다 세기 시작하는 시각 — 구간 안의 마지막 초기화(XP 쪽 · 반영된 것만)와 지금 문서가 생긴 시각 중 늦은 쪽
  //    📌 2026-10-04 퇴장 초기화(bot features/leaveReset.js)도 문서를 지운 시각에 Payout(kind "reset" · 금액 0 · paid)을 남긴다 — 관리자 초기화와 같이 여기서 잡힌다.
  //       그 기록이 없던 예전 퇴장(또는 기록 쓰기가 실패한 퇴장)은 다시 생긴 문서의 생성 시각(_id)부터 센다.
  //       XP 를 쓰려면 잔액이 든 문서가 먼저 있어야 하므로 정상 지출은 생성 시각보다 앞서지 않는다(_id 는 초 단위로 내림)
  const [resets, born] = await Promise.all([
    Payout.aggregate([
      { $match: { userId: { $nin: ["", null] }, status: "paid", currency: { $ne: "point" }, $or: RESET_PAYOUT } },
      { $addFields: { at: { $ifNull: ["$paidAt", "$createdAt"] } } },
      { $match: { at: { $gte: since } } },
      { $group: { _id: "$userId", at: { $max: "$at" } } },
    ]),
    UserXp.find({ _id: { $gt: mongoose.Types.ObjectId.createFromTime(Math.floor(since.getTime() / 1000)) } }, { userId: 1 }).lean(),
  ]);
  const floor = new Map(resets.map((r) => [r._id, r.at]));
  for (const d of born) {
    const at = d._id.getTimestamp();
    const cur = floor.get(d.userId);
    if (d.userId && at > since && !(cur && cur >= at)) floor.set(d.userId, at);
  }
  const users = [...floor.keys()];
  const times = users.map((u) => floor.get(u));
  // 이 줄의 사람이 그 시각보다 앞선 줄은 버린다(같은 시각은 센다)
  const afterReset = users.length
    ? [{
        $match: {
          $expr: {
            $let: {
              vars: { i: { $indexOfArray: [{ $literal: users }, "$userId"] } },
              in: { $or: [{ $lt: ["$$i", 0] }, { $gte: ["$at", { $arrayElemAt: [{ $literal: times }, "$$i"] }] }] },
            },
          },
        },
      }]
    : [];

  // 2) 쓴 XP — 출처마다 사람별 합(결제 · 비용은 +, 돌려받은 것은 −)
  const [buys, backs, costs] = await Promise.all([
    Purchase.aggregate([
      { $match: { createdAt: { $gte: since }, userId: { $nin: ["", null] } } },
      { $project: { userId: 1, at: "$createdAt", v: paidXpOf } },
      { $match: { v: { $gt: 0 } } },
      ...afterReset,
      { $group: { _id: "$userId", v: { $sum: "$v" } } },
    ]),
    Purchase.aggregate([
      { $match: { status: { $in: ["cancelled", "refunded"] }, userId: { $nin: ["", null] }, $nor: [TEST_RESET] } },
      { $project: { userId: 1, at: { $ifNull: ["$revokedAt", { $ifNull: ["$processedAt", "$createdAt"] }] }, v: paidXpOf } },
      { $match: { at: { $gte: since }, v: { $gt: 0 } } },
      ...afterReset,
      { $group: { _id: "$userId", v: { $sum: { $multiply: ["$v", -1] } } } },
    ]),
    WalletLog.aggregate([
      { $match: { createdAt: { $gte: since }, kind: { $in: SPEND_KINDS }, currency: { $ne: "point" }, amount: { $ne: 0 } } },
      { $project: { userId: 1, at: "$createdAt", v: { $multiply: ["$amount", -1] } } },
      ...afterReset,
      { $group: { _id: "$userId", v: { $sum: "$v" } } },
    ]),
  ]);
  const spent = new Map();
  for (const r of [...buys, ...backs, ...costs]) {
    if (!r._id) continue;
    spent.set(r._id, (spent.get(r._id) || 0) + (r.v || 0));
  }

  // 3) 보유 XP 가 있거나 쓴 기록이 있는 사람 — 다 써서 보유 0 인 사람도 누적에는 선다
  const docs = await UserXp.find(
    { $or: [{ xp: { $gt: 0 } }, ...(spent.size ? [{ userId: { $in: [...spent.keys()] } }] : [])] },
    { userId: 1, displayName: 1, username: 1, xp: 1, level: 1, attendCount: 1 }
  ).lean();

  const board = docs
    .map((d) => ({
      userId: d.userId,
      xp: (d.xp || 0) + (spent.get(d.userId) || 0),
      name: d.displayName || d.username || NO_NAME,
      level: d.level ?? 0,
      attendCount: d.attendCount || 0,
    }))
    .filter((r) => r.userId && r.xp > 0)
    // 동점은 userId 오름차순 — 다른 기준과 같은 규칙
    .sort((a, b) => b.xp - a.xp || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

  totalCache = { at: Date.now(), key, board };
  return board;
}

// 📌 내 순위 한 줄(me=1) — 로그인한 본인 것만(세션 기준, 남의 순위는 물을 수 없다). 그 기준에서 순위가 없으면 null.
//    page = 이 limit 로 넘길 때 내가 있는 쪽(0 부터). 배지는 목록과 같은 판정(badgesOfUsers)
async function withMyBadges(row) {
  const map = await badgesOfUsers([row.userId]).catch(() => null);
  return map?.has(row.userId) ? { ...row, badges: map.get(row.userId) } : row;
}

// ── [조회] 랭킹 ──────────────────────────────────────────────
//   period=all   현재 XP        (UserXp.xp — 관리자 회수 · 초기화는 이미 빠져 있다)
//   period=total 누적 XP        (이번 시즌 얻은 XP 전부 = 현재 + 이번 시즌에 쓴 XP — totalBoard)
//   period=month 이번 달 획득   (이번 달 XpLog + 이번 달 지급된 XP − 관리자 회수 · 초기화 — monthBoard)
//   period=voice 누적 음성 시간 (UserXp.voiceSeconds — 시즌 2 개시일부터 적립, 10/3부터 실제 접속 초 · 봇 features/voiceTime.js)
//   skip/limit 으로 페이지를 넘긴다. 순위는 skip 을 더해 이어진다.
//   me=1 이면 로그인한 본인의 순위 · 값 · 쪽(me)을 함께 준다 — 목록에 없을 때 화면이 내 줄을 따로 그린다
export async function GET(request) {
  try {
    await connectToDatabase();
    // SYSTEM : LEVEL 비공개 동안은 전원 순위를 밖으로 내보내지 않는다 (화면만 가리면 API 로 새어 나간다)
    const gate = await BotSetting.findOne({ key: "main" }, { levelPublic: 1, ledgerSince: 1 }).lean();
    if (!gate?.levelPublic && (await requireAdmin()).deny) {
      return NextResponse.json({ success: false, data: [], total: 0, message: "공개 전입니다." }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50));
    const skip = Math.max(0, parseInt(sp.get("skip") || "0", 10) || 0);
    const raw = sp.get("period");
    const period = raw === "month" || raw === "voice" || raw === "total" ? raw : "all";
    // 내 순위 — 세션의 본인 ID 만 쓴다(쿼리로 남의 ID 를 받지 않는다)
    const wantMe = sp.get("me") === "1";
    const session = wantMe ? await getSession() : null;
    const myId = session?.user?.id || "";
    const myName = session?.user?.name || "";
    const pageOf = (rank) => Math.floor((rank - 1) / limit);

    if (period === "total") {
      // 전원 값을 세어(캐시) 자른다 — 총원은 0 보다 큰 사람 전체
      const since = totalSince(gate?.ledgerSince);
      const board = await totalBoard(since);
      const rows = board.slice(skip, skip + limit);
      const myIdx = myId ? board.findIndex((r) => r.userId === myId) : -1;
      const totalData = await finish(rows.map((r, i) => ({ rank: skip + i + 1, ...r })), skip);
      let me = null;
      if (myIdx >= 0) {
        const r = board[myIdx];
        me = await withMyBadges({
          ...r,
          rank: myIdx + 1,
          page: pageOf(myIdx + 1),
          name: r.name === NO_NAME ? myName || NO_NAME : r.name,
        });
      }
      return NextResponse.json({ success: true, period, since, data: totalData, total: board.length, ...(wantMe ? { me } : {}) });
    }

    if (period === "month") {
      const monthStart = kstMonthStart();
      // 전원 값을 세고(이번 달 활동한 사람만이라 작다) 정렬한 뒤 잘라 낸다. 총원은 0 보다 큰 사람 전체여야 페이지 수가 맞는다
      const board = await monthBoard(monthStart);
      const rows = board.slice(skip, skip + limit);
      const myIdx = myId ? board.findIndex((r) => r.userId === myId) : -1;

      // 현재 레벨·이름은 UserXp 문서에서 채워 넣는다
      const docs = await UserXp.find(
        { userId: { $in: [...rows.map((r) => r.userId), ...(myIdx >= 0 ? [myId] : [])] } },
        { userId: 1, level: 1, displayName: 1 }
      ).lean();
      const byId = new Map(docs.map((u) => [u.userId, u]));

      const monthData = await finish(
        rows.map((r, i) => ({
          rank: skip + i + 1,
          userId: r.userId,
          name: byId.get(r.userId)?.displayName || r.displayName || NO_NAME,
          xp: r.xp,
          level: byId.get(r.userId)?.level ?? 0,
        })),
        skip
      );
      let me = null;
      if (myIdx >= 0) {
        const r = board[myIdx];
        me = await withMyBadges({
          rank: myIdx + 1,
          page: pageOf(myIdx + 1),
          userId: myId,
          name: byId.get(myId)?.displayName || r.displayName || myName || NO_NAME,
          xp: r.xp,
          level: byId.get(myId)?.level ?? 0,
        });
      }
      return NextResponse.json({ success: true, period, monthStart, data: monthData, total: board.length, ...(wantMe ? { me } : {}) });
    }

    // 현재 · 음성 — 내 문서 하나로 내 순위를 센다(정렬과 같은 규칙: 값 내림차순, 동점은 userId 오름차순)
    const myDoc = myId
      ? await UserXp.findOne({ userId: myId }, { userId: 1, displayName: 1, username: 1, xp: 1, level: 1, attendCount: 1, voiceSeconds: 1 }).lean()
      : null;

    if (period === "voice") {
      // 음성 시간은 시즌 2 개시일부터 쌓이므로 그 전에는 전원 0이다.
      // 0인 사람까지 줄 세우면 순위가 의미 없으므로 1초라도 있는 사람만 센다.
      const filter = { voiceSeconds: { $gt: 0 } };
      const myV = myDoc?.voiceSeconds || 0;
      const [rows, total, myAbove] = await Promise.all([
        UserXp.find(filter, { userId: 1, displayName: 1, username: 1, level: 1, voiceSeconds: 1 })
          .sort({ voiceSeconds: -1, userId: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserXp.countDocuments(filter),
        myV > 0 ? UserXp.countDocuments({ $or: [{ voiceSeconds: { $gt: myV } }, { voiceSeconds: myV, userId: { $lt: myId } }] }) : null,
      ]);

      const voiceData = await finish(
        rows.map((r, i) => ({
          rank: skip + i + 1,
          userId: r.userId,
          name: r.displayName || r.username || NO_NAME,
          level: r.level,
          voiceSeconds: r.voiceSeconds || 0,
        })),
        skip
      );
      const me = myAbove == null ? null : await withMyBadges({
        rank: myAbove + 1,
        page: pageOf(myAbove + 1),
        userId: myId,
        name: myDoc.displayName || myDoc.username || myName || NO_NAME,
        level: myDoc.level ?? 0,
        voiceSeconds: myV,
      });
      return NextResponse.json({ success: true, period, data: voiceData, total, ...(wantMe ? { me } : {}) });
    }

    const myXp = myDoc?.xp || 0;
    const [rows, total, myAbove] = await Promise.all([
      UserXp.find({}, { userId: 1, displayName: 1, username: 1, xp: 1, level: 1, attendCount: 1 })
        .sort({ xp: -1, userId: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserXp.countDocuments(),
      myDoc ? UserXp.countDocuments({ $or: [{ xp: { $gt: myXp } }, { xp: myXp, userId: { $lt: myId } }] }) : null,
    ]);

    const allData = await finish(
      rows.map((r, i) => ({
        rank: skip + i + 1,
        userId: r.userId,
        name: r.displayName || r.username || NO_NAME,
        xp: r.xp,
        level: r.level,
        attendCount: r.attendCount || 0,
      })),
      skip
    );
    const me = myAbove == null ? null : await withMyBadges({
      rank: myAbove + 1,
      page: pageOf(myAbove + 1),
      userId: myId,
      name: myDoc.displayName || myDoc.username || myName || NO_NAME,
      xp: myXp,
      level: myDoc.level ?? 0,
      attendCount: myDoc.attendCount || 0,
    });
    return NextResponse.json({ success: true, period, data: allData, total, ...(wantMe ? { me } : {}) });
  } catch (e) {
    console.error("리더보드 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], total: 0 }, { status: 500 });
  }
}
