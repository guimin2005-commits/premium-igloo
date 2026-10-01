export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getShopAccess } from "@/lib/shopAccess";
import { buildStats, recommend, related, activityOf, SOLD_STATUS, SHOP_ID_RE, WINDOW_DAYS } from "@/lib/shopRecommend";
import { SEASON } from "@/lib/season";
import Item from "@/models/Item";
import Purchase from "@/models/Purchase";
import QuestClaim from "@/models/QuestClaim";
import ShopItem from "@/models/ShopItem";
import UserXp from "@/models/UserXp";
import XpLog from "@/models/XpLog";

// 📌 ARCTIC 홈 추천 — '지금 잘 나가는' · '○○에게 맞는' · '이번 주' 의 상품 id 와 제목만 돌려준다 (계산은 lib/shopRecommend.js)
//    구매 기록은 개인 데이터라 원자료는 내리지 않는다 — 결과 id 와 제목만.
//    전체 집계(요즘 인기 · 등급별 인기 · 함께 산 표) · 아이템 효과(계열 · 활동 채널 판정)는 5분 메모리 캐시,
//    내 활동(최근 14일 XP 기록 · 퀘스트)은 유저마다 10분 캐시, 내 보유 · 예산 · 상품 목록은 요청마다 읽는다.

const TTL = 5 * 60 * 1000;
const DAY = 86400000;
// 서버 인스턴스마다 한 벌 — 동시에 여러 요청이 와도 집계는 한 번만 돈다(promise 공유)
let cache = { at: 0, stats: null, docs: null, promise: null };

// 📌 아이템 효과 — 상품에 연결된 아이템(ShopItem.itemId)의 효과 칸만. 계열(부스트 · 성장 · 스킨 · 배지 …)과 활동 채널을 정한다
async function loadDocs() {
  const rows = await Item.find({}, { _id: 1, type: 1, chatBuffXp: 1, voiceBuffXp: 1, attendBuffXp: 1, effects: 1 }).lean();
  return new Map(rows.map((r) => [String(r._id), r]));
}

// 📌 내 활동 — 최근 14일 XP 기록(채팅 · 음성 · 출석 합)과 퀘스트 수령 수. 유저마다 10분 캐시(같은 날 결과가 흔들리지 않게 · DB 부담)
const ACT_DAYS = 14;
const ACT_TTL = 10 * 60 * 1000;
const ACT_MAX = 2000; // 캐시 상한 — 넘으면 비우고 다시 쌓는다
const actCache = new Map();
async function loadActivity(userId) {
  const now = Date.now();
  const hit = actCache.get(userId);
  if (hit && now - hit.at < ACT_TTL) return hit.data;
  const since = new Date(now - ACT_DAYS * DAY);
  const [logs, quests] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: since }, reason: { $in: ["chat", "voice", "attend"] } } },
      { $group: { _id: "$reason", xp: { $sum: "$amount" }, n: { $sum: 1 } } },
    ]),
    QuestClaim.countDocuments({ userId, createdAt: { $gte: since } }),
  ]);
  const data = { log: {}, logCount: 0, quests };
  for (const g of logs) {
    data.log[g._id] = Math.max(0, Number(g.xp) || 0);
    data.logCount += Number(g.n) || 0;
  }
  if (actCache.size >= ACT_MAX) actCache.clear();
  actCache.set(userId, { at: now, data });
  return data;
}

async function loadStats() {
  const now = Date.now();
  if (cache.stats && now - cache.at < TTL) return { stats: cache.stats, docs: cache.docs };
  if (cache.promise) return cache.promise;
  cache.promise = (async () => {
    // 📌 최근 180일 · 구매로 세는 상태 · 상점 상품 id 만. 필요한 필드만 읽는다
    //    Purchase 의 { createdAt: -1, status: 1 } 인덱스로 기간 · 상태를 좁히고 최신순으로 읽는다. 넘치면 최근 것부터
    const since = new Date(now - WINDOW_DAYS * DAY);
    const [purchases, docs] = await Promise.all([
      Purchase.find(
        {
          createdAt: { $gte: since },
          status: { $in: SOLD_STATUS },
          itemId: { $regex: SHOP_ID_RE },
        },
        { _id: 0, userId: 1, itemId: 1, createdAt: 1, status: 1, paidXp: 1 }
      ).sort({ createdAt: -1 }).limit(50000).lean(),
      loadDocs(),
    ]);
    // 구매자의 지금 레벨 · XP — 등급 구간 판정용 (구매 시점 레벨은 남아 있지 않아 낸 XP 를 되돌려 근사한다)
    const buyers = [...new Set(purchases.map((p) => p.userId))];
    const rows = buyers.length
      ? await UserXp.find({ userId: { $in: buyers } }, { _id: 0, userId: 1, level: 1, xp: 1 }).lean()
      : [];
    const levels = new Map(rows.map((r) => [r.userId, { level: r.level || 0, xp: r.xp || 0 }]));
    const stats = buildStats({ purchases, levels, now });
    cache = { at: now, stats, docs, promise: null };
    return { stats, docs };
  })().catch((e) => {
    cache.promise = null;
    throw e;
  });
  return cache.promise;
}

// ── [조회] 추천 결과 — { hot: [id], hotTitle, forMe: { title, sub, basis, ids, days }, deal: { id, kind }, renewSoon: [{ id, expiresAt }] } ──
//    ?related=<상품 id> 면 상품 상세 '다른 상품도 둘러보세요' — { related: [id] } (lib/shopRecommend.js related, 4개)
export async function GET(request) {
  try {
    await connectToDatabase();
    // 상점 목록과 같은 기준 — 공개 전에는 관리자만
    const { session, canView } = await getShopAccess();
    if (!canView) {
      return NextResponse.json({ success: false, error: "준비 중입니다." }, { status: 403 });
    }

    const relatedTo = new URL(request.url).searchParams.get("related");
    if (relatedTo != null && !SHOP_ID_RE.test(relatedTo)) {
      return NextResponse.json({ success: false, message: "상품을 찾을 수 없습니다." }, { status: 400 });
    }

    const userId = session?.user?.id ? String(session.user.id) : "";
    const isHome = relatedTo == null;
    const [{ stats, docs }, items, wallet, mine, actLog] = await Promise.all([
      loadStats(),
      ShopItem.find(
        { active: true },
        { _id: 1, type: 1, itemId: 1, roleId: 1, unitSale: 1, price: 1, durations: 1, discountPct: 1, discountUntil: 1, pointOnly: 1, stock: 1, sortOrder: 1, createdAt: 1, active: 1 }
      ).lean(),
      userId
        ? UserXp.findOne({ userId }, {
          _id: 0, level: 1, xp: 1, point: 1,
          // 활동 성향 — XP 기록이 없을 때의 대신 값(시즌 음성 시간 · 최근 채팅 · 연속 출석 · 강화 · 패스)
          voiceSeconds: 1, lastChatXpAt: 1, attendStreak: 1, chatEnhance: 1, voiceEnhance: 1, passSeason: 1, passUnlocked: 1,
        }).lean()
        : null,
      userId
        ? Purchase.find({ userId, consumedAt: null }, { _id: 0, itemId: 1, itemRef: 1, roleId: 1, status: 1, expiresAt: 1, days: 1, createdAt: 1 }).lean()
        : [],
      // 상품 상세(관련 상품)는 활동을 쓰지 않는다. 📌 활동을 못 읽어도 추천은 낸다(활동 근거만 빠진다)
      userId && isHome ? loadActivity(userId).catch((e) => { console.error("추천 활동 조회 오류:", e); return null; }) : null,
    ]);

    const me = userId
      ? {
        userId, level: wallet?.level || 0, xp: wallet?.xp || 0, point: wallet?.point || 0, purchases: mine,
        // 기록을 못 읽었으면(actLog null) 시즌 음성 시간 · 연속 출석 같은 대신 값으로만 잰다
        act: isHome
          ? activityOf({
            ...(actLog || {}),
            voiceSeconds: wallet?.voiceSeconds, lastChatXpAt: wallet?.lastChatXpAt, attendStreak: wallet?.attendStreak,
            chatEnhance: wallet?.chatEnhance, voiceEnhance: wallet?.voiceEnhance,
            passUnlocked: !!wallet?.passUnlocked && Number(wallet?.passSeason) === Number(SEASON.number),
          })
          : null,
      }
      : null;
    const list = items.map((it) => ({ ...it, _id: String(it._id) }));
    const data = isHome
      ? recommend({ stats, docs, items: list, me })
      : { related: related({ stats, docs, items: list, baseId: relatedTo, me }) };

    // 개인 결과라 브라우저 · 중간 캐시에 남기지 않는다
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("상점 추천 오류:", e);
    return NextResponse.json({ success: false, message: "추천을 불러오지 못했습니다." }, { status: 500 });
  }
}
