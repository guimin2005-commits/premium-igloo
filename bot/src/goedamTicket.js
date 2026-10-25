// ── 괴담회 추첨권 마감 ─────────────────────────────────  (봇 지급 DM · /인벤토리 공용)
//    📌 2026-10-25 운영자 "추첨권 구매 했는데 영구로 뜸" — 추첨권은 어디서 받았든(상영 · 음성 · 그룹 · 초대 · 상점 · 수동 지급) 추첨 마감에 끝난다
//       (사이트 lib/goedam.js goedamTicketInfo · lib/inventory.js 와 같은 규칙 — 지급 기록마다 만료를 쓰지 않고 읽을 때 맞춘다).
//       봇은 지급 완료 DM(features/grantQueue.js)의 이용 기간과 /인벤토리(views/inventory.js)의 남은 날에 쓴다.
//    추첨권 줄 고르기도 사이트 ticketFilter 와 같다 — itemRef = 추첨권 아이템 · 지급 표식 itemId "goedam-ticket" · 그 아이템을 가리키는 상품으로 산 것
import { Goedam, ShopItem } from "./db.js";
import { GOEDAM_KEY, GOEDAM_TICKET_ITEM_ID } from "./features/goedamWatch.js";

const TTL_MS = 60 * 1000;
let cache = { at: 0, v: null };

// { id: 추첨권 아이템 id("" = 설정 없음), closesAt: Date | null(끝은 들어가지 않는다), shops: Set(그 아이템을 가리키는 상품 id) } — 1분 캐시
export async function goedamTicketInfo() {
  if (cache.v && Date.now() - cache.at < TTL_MS) return cache.v;
  const d = await Goedam.findOne({ key: GOEDAM_KEY }, { ticketItemId: 1, drawClosesAt: 1 }).lean();
  const id = String(d?.ticketItemId || "").trim();
  const closesAt = d?.drawClosesAt ? new Date(d.drawClosesAt) : null;
  const shops = id ? new Set((await ShopItem.find({ itemId: id }, { _id: 1 }).lean()).map((s) => String(s._id))) : new Set();
  cache = { at: Date.now(), v: { id, closesAt: closesAt && Number.isFinite(closesAt.getTime()) ? closesAt : null, shops } };
  return cache.v;
}

// 이 구매 줄이 추첨권인가
export const isTicketPurchase = (p, t) =>
  !!t?.id && (String(p?.itemRef || "") === t.id || p?.itemId === GOEDAM_TICKET_ITEM_ID || t.shops.has(String(p?.itemId || "")));
