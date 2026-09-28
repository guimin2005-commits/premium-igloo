export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getShopAccess } from "@/lib/shopAccess";
import { buildStats, recommend, related, SOLD_STATUS, SHOP_ID_RE, WINDOW_DAYS } from "@/lib/shopRecommend";
import Purchase from "@/models/Purchase";
import ShopItem from "@/models/ShopItem";
import UserXp from "@/models/UserXp";

// 📌 ARCTIC 홈 추천 — '지금 잘 나가는' · '○○에게 맞는' · '이번 주' 의 상품 id 만 돌려준다 (계산은 lib/shopRecommend.js)
//    구매 기록은 개인 데이터라 원자료는 내리지 않는다 — 결과 id 와 제목만.
//    전체 집계(요즘 인기 · 등급별 인기 · 함께 산 표)는 5분 메모리 캐시, 내 보유 · 예산 · 상품 목록은 요청마다 읽는다.

const TTL = 5 * 60 * 1000;
const DAY = 86400000;
// 서버 인스턴스마다 한 벌 — 동시에 여러 요청이 와도 집계는 한 번만 돈다(promise 공유)
let cache = { at: 0, stats: null, promise: null };

async function loadStats() {
  const now = Date.now();
  if (cache.stats && now - cache.at < TTL) return cache.stats;
  if (cache.promise) return cache.promise;
  cache.promise = (async () => {
    // 📌 최근 180일 · 구매로 세는 상태 · 상점 상품 id 만. 필요한 필드만 읽는다
    //    Purchase 의 { createdAt: -1, status: 1 } 인덱스로 기간 · 상태를 좁히고 최신순으로 읽는다. 넘치면 최근 것부터
    const since = new Date(now - WINDOW_DAYS * DAY);
    const purchases = await Purchase.find(
      {
        createdAt: { $gte: since },
        status: { $in: SOLD_STATUS },
        itemId: { $regex: SHOP_ID_RE },
      },
      { _id: 0, userId: 1, itemId: 1, createdAt: 1, status: 1, paidXp: 1 }
    ).sort({ createdAt: -1 }).limit(50000).lean();
    // 구매자의 지금 레벨 · XP — 등급 구간 판정용 (구매 시점 레벨은 남아 있지 않아 낸 XP 를 되돌려 근사한다)
    const buyers = [...new Set(purchases.map((p) => p.userId))];
    const rows = buyers.length
      ? await UserXp.find({ userId: { $in: buyers } }, { _id: 0, userId: 1, level: 1, xp: 1 }).lean()
      : [];
    const levels = new Map(rows.map((r) => [r.userId, { level: r.level || 0, xp: r.xp || 0 }]));
    const stats = buildStats({ purchases, levels, now });
    cache = { at: now, stats, promise: null };
    return stats;
  })().catch((e) => {
    cache.promise = null;
    throw e;
  });
  return cache.promise;
}

// ── [조회] 추천 결과 — { hot: [id], forMe: { title, ids, basis }, deal: { id, kind }, renewSoon: [{ id, expiresAt }] } ──
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
    const [stats, items, wallet, mine] = await Promise.all([
      loadStats(),
      ShopItem.find(
        { active: true },
        { _id: 1, type: 1, itemId: 1, price: 1, durations: 1, discountPct: 1, discountUntil: 1, pointOnly: 1, stock: 1, soldCount: 1, sortOrder: 1, createdAt: 1, active: 1 }
      ).lean(),
      userId ? UserXp.findOne({ userId }, { _id: 0, level: 1, xp: 1, point: 1 }).lean() : null,
      userId
        ? Purchase.find({ userId, consumedAt: null }, { _id: 0, itemId: 1, itemRef: 1, status: 1, expiresAt: 1, days: 1, createdAt: 1 }).lean()
        : [],
    ]);

    const me = userId
      ? { userId, level: wallet?.level || 0, xp: wallet?.xp || 0, point: wallet?.point || 0, purchases: mine }
      : null;
    const list = items.map((it) => ({ ...it, _id: String(it._id) }));
    const data = relatedTo != null
      ? { related: related({ stats, items: list, baseId: relatedTo, me }) }
      : recommend({ stats, items: list, me });

    // 개인 결과라 브라우저 · 중간 캐시에 남기지 않는다
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("상점 추천 오류:", e);
    return NextResponse.json({ success: false, message: "추천을 불러오지 못했습니다." }, { status: 500 });
  }
}
