import Purchase from "@/models/Purchase";
import { isUnitSale } from "@/lib/unitSale";

// 📌 기간제 연장 · 업그레이드 규칙 — 바로 구매(api/shop/purchase) · 장바구니 결제(api/shop/checkout)가 같은 판정을 쓴다.
//    화면 판정(app/arctic/owned.ts 의 ownStateOf · renewBaseOf)과 같은 기준이어야 한다.
//    살아 있는 보유 = 대기 · 완료이면서 기간이 없거나 남은 구매 중 같은 상품이거나 같은 아이템(itemRef)을 가리키는 것
//      보유 없음                  → 새 구매
//      무제한 보유가 하나라도 있음 → 막는다 (1인 1개)
//      전부 기간제 + 이번에 기간제 → 연장: 가장 늦게 끝나는 보유 뒤에 이어 붙인다 (renewOf · startsAt · expiresAt)
//      전부 기간제 + 이번에 무제한 → 업그레이드: 기존 기간제는 그대로 두고 새 무제한 구매
//    ⚠️ 유저 자물쇠(ShopLock)를 잡은 뒤에 읽어야 한다 — 동시에 보낸 두 결제가 같은 끝에 이어 붙지 않게
const DAY = 86400000;

// 상품 여러 개의 살아 있는 보유를 한 번에 읽는다
export async function liveHoldings(userId, docs) {
  const ids = docs.map((d) => String(d._id));
  const refs = docs.map((d) => d.itemId).filter(Boolean);
  return Purchase.find({
    userId,
    status: { $in: ["pending", "completed"] },
    consumedAt: null, // 다 쓴 소모품(연속 출석 보호막)은 보유가 아니다
    $and: [
      { $or: [{ itemId: { $in: ids } }, ...(refs.length ? [{ itemRef: { $in: refs } }] : [])] },
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
    ],
  }, { itemName: 1, itemId: 1, itemRef: 1, expiresAt: 1 }).lean();
}

// 상품 하나의 판정 — { block: 막은 보유 건 } | { renew: 이어 붙일 보유 건 } | {} (새 구매 · 업그레이드)
export function planPurchase(doc, days, holdings) {
  // 📌 1개 단위 상품(lib/unitSale.js)은 1인 1개 제한이 없다 — 늘 새 구매(만료 없음). 가진 만큼 인벤토리에 ×N 으로 쌓인다
  if (isUnitSale(doc)) return {};
  const id = String(doc._id);
  const live = holdings.filter((p) => String(p.itemId) === id || (!!doc.itemId && p.itemRef === doc.itemId));
  if (!live.length) return {};
  const forever = live.find((p) => !p.expiresAt);
  if (forever) return { block: forever };
  if (!(days > 0)) return { upgrade: true };
  const base = live.reduce((a, b) => (new Date(b.expiresAt).getTime() > new Date(a.expiresAt).getTime() ? b : a));
  return { renew: base };
}

// 구매 기록에 넣을 기간 — 새 구매는 결제 시점부터(봇 지급이 늦어도 산 만큼 보장), 연장은 이어 붙인 건의 만료부터
export function timingOf(plan, days, now = Date.now()) {
  if (plan?.renew) {
    const startsAt = new Date(plan.renew.expiresAt);
    return { renewOf: String(plan.renew._id), startsAt, expiresAt: new Date(startsAt.getTime() + days * DAY) };
  }
  return { renewOf: "", startsAt: null, expiresAt: days > 0 ? new Date(now + days * DAY) : null };
}

// 만료 표기 — "2026.11.02 14:00" (KST)
export function kstStamp(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(date)).map((x) => [x.type, x.value])
  );
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}
