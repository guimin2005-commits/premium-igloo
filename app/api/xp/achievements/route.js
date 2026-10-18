export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import UserXp from "@/models/UserXp";
import ActivityStat from "@/models/ActivityStat";
import QuestClaim from "@/models/QuestClaim";
import Purchase from "@/models/Purchase";
import Payout from "@/models/Payout";
import Achievement from "@/models/Achievement";
import { addPoints } from "@/lib/points";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { denyIfXpStopped } from "@/lib/xpStop";
import {
  ACHIEVEMENTS_ON,
  ACHIEVEMENTS,
  ACT_KINDS,
  DAWN_HOURS,
  achievementOf,
  buildAchievementView,
  isUnlocked,
  rarityCounts,
  recordsSince,
  statsFromParts,
} from "@/lib/achievements";

// 📌 업적(도전과제) — 목록 · 진행 · 희귀도 조회(GET), 보상 받기 · 본 표시(POST). 규칙 · 보상 표는 lib/achievements.js 하나.
//    GET  → { total, unlocked, groups, items, newly, claimLocked }
//    POST { action: "claim", key } → { xp, point, balance: { xp, point, level } }   · { action: "seen", keys: [] } → {}
//    실패는 { success:false, code, message }.
//    📌 테스트 사이트(localhost — process.env.VERCEL 없음)는 같은 DB 를 쓰므로 업적 쪽으로는 아무것도 쓰지 않는다:
//       진행 · 깬 것은 메모리에서 계산해 보이고(실사이트가 남긴 기록은 읽어서 같이 보인다), 받기는 409 LOCAL, 본 표시는 하지 않는다(화면의 localStorage)
//    📌 XP 는 퀘스트 받기(app/api/xp/quests)와 같은 봇 지급 대기열(Payout source "achievement")로 — 봇이 XP · 레벨 · 등급 역할 · 레벨업 알림을 같이 맞춘다(약 30초).
//       빙옥은 사이트가 바로(addPoints · 원장 WalletLog kind "achievement"). 받기는 { claimedAt: null } 조건부 갱신이 한 번만 통과시킨다
//    📌 퇴장 초기화(UserXp 문서를 통째로 지움) 뒤 다시 들어온 사람 — 그 전에 깨고 안 받은 기록 · 그 전 퀘스트 · 구매 수는 치지 않는다(recordsSince · bornOf).
//       받은 기록은 남는다(같은 보상을 두 번 받지 않게)
const isLive = () => !!process.env.VERCEL;

const fail = (status, code, message) => NextResponse.json({ success: false, code, message, error: message }, { status });
// 다른 입구(점검 · 비공개 · XP 중단)의 거절을 같은 모양으로 — 상태와 문구는 그대로, code 만 붙인다
async function relay(res, code) {
  let j = {};
  try {
    j = await res.clone().json();
  } catch {}
  return fail(res.status, j?.code || code, j?.message || j?.error || "");
}

// ── 기록 읽기 ──
//    _id — 문서가 생긴 시각(bornOf). 퇴장 초기화(봇 leaveReset)는 문서를 지우고, 다시 들어오면 새 문서가 생긴다
const USER_FIELDS = {
  _id: 1, userId: 1, xp: 1, level: 1, maxLevel: 1, point: 1, voiceSeconds: 1, attendCount: 1, attendStreak: 1, attendBestStreak: 1,
  chatEnhance: 1, voiceEnhance: 1, cardSkinPick: 1, cardScenePick: 1, avatarFramePick: 1, badgePick: 1, passUnlocked: 1, seasonHistory: 1,
};
const REC_FIELDS = { _id: 0, key: 1, unlockedAt: 1, seenAt: 1, claimedAt: 1, rewardXp: 1, rewardPoint: 1 };

// 활동 횟수 합 — 메시지 · 반응 받기 · 새벽 메시지(KST 시 DAWN_HOURS)
const isMsg = { $eq: ["$k", "msg"] };
const actGroup = (id) => ({
  $group: {
    _id: id,
    msg: { $sum: { $cond: [isMsg, "$n", 0] } },
    reacted: { $sum: { $cond: [{ $eq: ["$k", "reacted"] }, "$n", 0] } },
    dawn: { $sum: { $cond: [{ $and: [isMsg, { $gte: ["$h", DAWN_HOURS[0]] }, { $lt: ["$h", DAWN_HOURS[1]] }] }, "$n", 0] } },
  },
});
// ARCTIC 구매 줄 — 결제된 상태 · 상점 상품(24자리 id — 운영진 지급 "grant" · 패스 보상 "season-pass" 제외) · 주문 묶음 + 상품 = 1건(lib/questKinds.js shop 과 같다)
const BUY_MATCH = { status: { $in: ["pending", "completed", "expired"] }, itemId: { $regex: /^[0-9a-f]{24}$/i } };
const ORDER_KEY = {
  $cond: [
    { $gt: [{ $ifNull: ["$orderId", ""] }, ""] },
    { $concat: ["o:", "$orderId", "|", { $toString: "$itemId" }] },
    { $concat: ["p:", { $toString: "$_id" }] },
  ],
};

// 지금 UserXp 문서가 생긴 시각(ms — _id 시각, lib/season.js passSince 와 같은 기준). 문서가 없으면 Infinity(남는 기록 · 세는 몫 없음)
const bornOf = (user) => {
  if (!user) return Infinity;
  const t = user._id?.getTimestamp?.()?.getTime?.();
  return Number.isFinite(t) ? t : 0;
};
// 기록 시각 조건에 쓰는 Date — Infinity 는 아주 먼 미래(아무것도 맞지 않게)
const sinceDate = (ms) => new Date(Number.isFinite(ms) ? Math.max(0, ms) : 8.64e15);

// 한 사람 — 조회와 받기 검증이 같은 함수. { stats, since(문서가 생긴 시각 ms) }
//    퀘스트 · 구매는 문서가 생긴 뒤 것만(퇴장 초기화 전 몫 제외 — 활동 횟수는 봇이 함께 지운다)
async function loadUserStats(userId) {
  const user = await UserXp.findOne({ userId }, USER_FIELDS).lean();
  const since = bornOf(user);
  if (!user) return { stats: statsFromParts({}), since };
  const xp = Number(user.xp) || 0;
  const after = since > 0 ? { createdAt: { $gte: sinceDate(since) } } : {};
  const [act, quests, buys, above] = await Promise.all([
    ActivityStat.aggregate([{ $match: { u: userId, k: { $in: ACT_KINDS } } }, actGroup(null)]),
    QuestClaim.countDocuments({ userId, ...after }),
    Purchase.aggregate([{ $match: { userId, ...BUY_MATCH, ...after } }, { $group: { _id: ORDER_KEY } }, { $count: "n" }]),
    // 순위 = 나보다 위인 사람 + 1, 동점은 userId 오름차순(app/api/xp/me 와 같은 규칙)
    xp > 0 ? UserXp.countDocuments({ $or: [{ xp: { $gt: xp } }, { xp, userId: { $lt: userId } }] }) : 0,
  ]);
  return { stats: statsFromParts({ user, act: act[0], quests, buys: buys[0]?.n || 0, rank: xp > 0 ? above + 1 : 0 }), since };
}

// ── 희귀도 — 전체 유저 중 가진 사람 %. 서버(인스턴스)마다 10분 캐시, 지난 값이 있으면 기다리지 않고 그 값을 주며 뒤에서 다시 센다 ──
//    집계가 실패하면 1분 동안은 다시 세지 않는다(조회마다 전체를 다시 훑지 않게) — 그동안 지난 값 또는 빈 값(화면 "—")
//    퀘스트 · 구매 수는 문서가 생긴 시각으로 거르지 않는다(근삿값 — 다시 들어온 사람만 조금 많게 잡힌다)
const RARITY_TTL = 10 * 60 * 1000;
const RARITY_RETRY = 60 * 1000;
const EMPTY_RARITY = { total: 0, counts: {} };
let rarity = { at: 0, data: null, job: null, failAt: 0 };

async function computeRarity() {
  const [users, acts, quests, buys, recs] = await Promise.all([
    UserXp.find({}, USER_FIELDS).lean(),
    ActivityStat.aggregate([{ $match: { k: { $in: ACT_KINDS } } }, actGroup("$u")]).allowDiskUse(true),
    QuestClaim.aggregate([{ $group: { _id: "$userId", n: { $sum: 1 } } }]).allowDiskUse(true),
    Purchase.aggregate([
      { $match: BUY_MATCH },
      { $group: { _id: { u: "$userId", o: ORDER_KEY } } },
      { $group: { _id: "$_id.u", n: { $sum: 1 } } },
    ]).allowDiskUse(true),
    Achievement.find({ unlockedAt: { $ne: null } }, { _id: 0, userId: 1, key: 1, unlockedAt: 1, claimedAt: 1 }).lean(),
  ]);
  const actOf = new Map(acts.map((a) => [a._id, a]));
  const questOf = new Map(quests.map((q) => [q._id, q.n]));
  const buyOf = new Map(buys.map((b) => [b._id, b.n]));
  // 깬 기록 — 지금 문서에 남는 것만(recordsSince — 퇴장 초기화 전에 깨고 안 받은 기록은 빼고)
  const bornById = new Map(users.map((u) => [u.userId, bornOf(u)]));
  const persisted = new Map();
  for (const r of recs) {
    if (!bornById.has(r.userId) || !recordsSince([r], bornById.get(r.userId)).length) continue;
    if (!persisted.has(r.key)) persisted.set(r.key, new Set());
    persisted.get(r.key).add(r.userId);
  }
  // 순위 — xp 내림차순 · 동점 userId 오름차순
  const order = users
    .map((u) => ({ id: u.userId, xp: Number(u.xp) || 0 }))
    .sort((a, b) => b.xp - a.xp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rankOf = new Map(order.map((u, i) => [u.id, i + 1]));
  const rows = users.map((u) => ({
    userId: u.userId,
    stats: statsFromParts({ user: u, act: actOf.get(u.userId), quests: questOf.get(u.userId), buys: buyOf.get(u.userId), rank: rankOf.get(u.userId) }),
  }));
  return rarityCounts(rows, persisted);
}

async function getRarity() {
  const fresh = rarity.data && Date.now() - rarity.at < RARITY_TTL;
  if (fresh) return rarity.data;
  if (!rarity.job && Date.now() - rarity.failAt < RARITY_RETRY) return rarity.data || EMPTY_RARITY;
  if (!rarity.job) {
    rarity.job = computeRarity()
      .then((data) => {
        rarity = { at: Date.now(), data, job: null, failAt: 0 };
        return data;
      })
      .catch((e) => {
        rarity.job = null;
        rarity.failAt = Date.now();
        throw e;
      });
  }
  if (rarity.data) {
    rarity.job.catch((e) => console.error("업적 희귀도 집계 실패:", e?.message || e));
    return rarity.data;
  }
  return rarity.job;
}

// ── 쓰기(실사이트만) ──
let indexJob = null;
const ensureIndexes = () => {
  if (!indexJob) {
    indexJob = Achievement.createIndexes().catch((e) => {
      indexJob = null;
      throw e;
    });
  }
  return indexJob;
};
const isDup = (e) =>
  e?.code === 11000 ||
  (Array.isArray(e?.writeErrors) && e.writeErrors.length > 0 && e.writeErrors.every((w) => (w?.code ?? w?.err?.code) === 11000));

// 깬 줄 만들기 — 없으면 새로, 지금 문서보다 앞선 안 받은 줄(퇴장 초기화 전 — recordsSince 가 버린 것)은 지금 시각으로 다시 깬다.
//    받은 줄 · 이미 지금 문서에서 깬 줄은 filter 에 안 맞아 끼워 넣기가 유니크 인덱스(11000)에 막힌다 — 그대로 둔다(isDup).
//    since: 지금 UserXp 문서가 생긴 시각(ms). 동시에 두 번 들어와도 유니크 인덱스가 한 줄로 막는다
async function upsertUnlocks(userId, keys, since, now = new Date()) {
  if (!keys.length) return;
  await ensureIndexes();
  try {
    await Achievement.bulkWrite(
      keys.map((key) => ({
        updateOne: {
          // userId · key · claimedAt(null) 은 끼워 넣을 때 filter 에서 들어간다($not 조건은 들어가지 않는다)
          filter: { userId, key, claimedAt: null, unlockedAt: { $not: { $gte: sinceDate(since) } } },
          update: { $set: { unlockedAt: now, seenAt: null, rewardXp: 0, rewardPoint: 0 } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (e) {
    if (!isDup(e)) throw e;
  }
}

const unauthorized = () => fail(401, "UNAUTHORIZED", "로그인이 필요합니다.");
// 📌 업적이 꺼져 있으면(lib/achievements ACHIEVEMENTS_ON — 운영자 "업적은 추후에") 세션 · DB 보다 먼저 404 — 아무것도 읽거나 적지 않는다(깬 기록 · 지급 없음)
const off = () => fail(404, "ACHIEVEMENTS_OFF", "없는 기능입니다.");

// ── [조회] 내 업적 ──
export async function GET() {
  if (!ACHIEVEMENTS_ON) return off();
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return unauthorized();

    await connectToDatabase();
    const live = isLive();
    const [{ stats, since }, recs, rare] = await Promise.all([
      loadUserStats(userId),
      Achievement.find({ userId }, REC_FIELDS).lean(),
      getRarity().catch((e) => {
        console.error("업적 희귀도 집계 실패:", e?.message || e);
        return EMPTY_RARITY;
      }),
    ]);
    let records = recordsSince(recs, since);

    // 📌 실사이트 — 지금 조건을 채운 업적 중 (남는) 기록이 없는 것을 깬 것으로 남긴다(소급 포함). 실패해도 조회는 계산한 값으로 보인다.
    //    테스트 사이트는 여기를 건너뛴다 — 이 라우트의 쓰기는 이 블록 · POST seen · POST claim 셋뿐이고 모두 isLive() 뒤에 있다
    if (live) {
      const have = new Set(records.map((r) => r.key));
      const fresh = ACHIEVEMENTS.filter((d) => !have.has(d.key) && isUnlocked(d, stats)).map((d) => d.key);
      if (fresh.length) {
        try {
          await upsertUnlocks(userId, fresh, since);
          records = recordsSince(await Achievement.find({ userId }, REC_FIELDS).lean(), since);
        } catch (e) {
          console.error(`업적 기록 실패 (${userId}):`, e?.message || e);
        }
      }
    }

    return NextResponse.json({ success: true, data: buildAchievementView({ stats, records, rarity: rare, live }) });
  } catch (e) {
    console.error("업적 조회 오류:", e);
    return fail(500, "SERVER", "조회 중 오류가 발생했습니다.");
  }
}

// ── [받기 · 본 표시] ──
export async function POST(request) {
  if (!ACHIEVEMENTS_ON) return off();
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");

    // 본 표시 — 새로 깬 업적 알림을 보여 준 뒤. 테스트 사이트는 아무것도 하지 않는다
    if (action === "seen") {
      const keys = [...new Set((Array.isArray(body?.keys) ? body.keys : []).map(String))].filter((k) => achievementOf(k)).slice(0, ACHIEVEMENTS.length);
      if (!isLive() || !keys.length) return NextResponse.json({ success: true });
      await connectToDatabase();
      await Achievement.updateMany({ userId, key: { $in: keys }, seenAt: null }, { $set: { seenAt: new Date() } });
      return NextResponse.json({ success: true });
    }

    if (action !== "claim") return fail(400, "BAD_REQUEST", "잘못된 요청입니다.");

    const def = achievementOf(body?.key);
    if (!def) return fail(404, "NOT_FOUND", "없는 업적입니다.");
    if (!isLive()) return fail(409, "LOCAL", "테스트 사이트에서는 받을 수 없습니다.");

    // 점검 · 비공개 · XP 획득 중단 — 퀘스트 받기와 같은 입구
    const maint = await denyIfMaintenance(session);
    if (maint) return relay(maint, "MAINTENANCE");
    await connectToDatabase();
    const closed = await denyIfLevelClosed(session);
    if (closed) return relay(closed, "LEVEL_CLOSED");
    const stopped = await denyIfXpStopped(userId);
    if (stopped) return relay(stopped, "XP_STOPPED");

    const payXp = Math.max(0, Math.floor(Number(def.xp) || 0));
    const payPoint = Math.max(0, Math.floor(Number(def.point) || 0));
    if (payXp <= 0 && payPoint <= 0) return fail(400, "NO_REWARD", "보상이 없는 업적입니다.");

    // 1) 깬 업적인지 — (지금 문서에 남는) 기록이 없으면 서버에서 다시 세어 보고(화면 값을 믿지 않는다) 채웠으면 그 자리에서 기록을 만든다
    await ensureIndexes();
    const [rec, born] = await Promise.all([
      Achievement.findOne({ userId, key: def.key }, { _id: 0, key: 1, unlockedAt: 1, claimedAt: 1 }).lean(),
      UserXp.findOne({ userId }, { _id: 1 }).lean().then(bornOf),
    ]);
    if (rec?.claimedAt) return fail(409, "ALREADY_CLAIMED", "이미 받은 보상입니다.");
    if (!recordsSince(rec ? [rec] : [], born).length) {
      const { stats, since } = await loadUserStats(userId);
      if (!isUnlocked(def, stats)) return fail(400, "NOT_UNLOCKED", "아직 달성하지 않은 업적입니다.");
      await upsertUnlocks(userId, [def.key], since);
    }

    // 2) 자물쇠 — claimedAt 이 비어 있고 지금 문서가 생긴 뒤 깬 줄만 한 번 통과(동시에 눌러도 두 번째는 null)
    const now = new Date();
    const lock = await Achievement.findOneAndUpdate(
      { userId, key: def.key, unlockedAt: { $gte: sinceDate(born) }, claimedAt: null },
      { $set: { claimedAt: now, rewardXp: payXp, rewardPoint: payPoint } },
      { returnDocument: "after", projection: { _id: 1 } }
    );
    if (!lock) return fail(409, "ALREADY_CLAIMED", "이미 받은 보상입니다.");
    const unlock = () =>
      Achievement.updateOne({ _id: lock._id, claimedAt: now }, { $set: { claimedAt: null, rewardXp: 0, rewardPoint: 0 } }).catch(() => {});

    // 3) 지급 — 실패하면 자물쇠를 풀어 다시 받을 수 있게(퀘스트 받기와 같은 순서)
    const label = `업적: ${def.title}`;
    let queued = null;
    if (payXp > 0) {
      try {
        queued = await Payout.create({ userName: session.user.name || userId, userId, amount: payXp, reason: label, source: "achievement" });
      } catch (e) {
        await unlock();
        throw e;
      }
    }
    if (payPoint > 0) {
      try {
        await addPoints(userId, payPoint, { kind: "achievement", label, refId: String(lock._id) });
      } catch (e) {
        // 봇이 아직 집지 않은 XP 예약만 지울 수 있다 — 이미 집어 갔으면 XP 는 나간 것이라 자물쇠를 남긴다
        if (queued) {
          const del = await Payout.deleteOne({ _id: queued._id, status: "pending" }).catch(() => null);
          if (!del?.deletedCount) throw e;
        }
        await unlock();
        throw e;
      }
    }

    // 잔액 — 빙옥은 반영된 값, XP 는 봇이 대기열을 처리하기 전 값(곧 payXp 만큼 오른다)
    const bal = await UserXp.findOne({ userId }, { _id: 0, xp: 1, point: 1, level: 1 }).lean();
    return NextResponse.json({
      success: true,
      data: {
        xp: payXp,
        point: payPoint,
        balance: { xp: Number(bal?.xp) || 0, point: Number(bal?.point) || 0, level: Number(bal?.level) || 0 },
      },
    });
  } catch (e) {
    console.error("업적 처리 오류:", e);
    return fail(500, "SERVER", "처리 중 오류가 발생했습니다.");
  }
}
