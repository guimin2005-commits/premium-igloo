import mongoose from "mongoose";
import Purchase from "@/models/Purchase";

// 📌 낸 값 없는 회수 — 운영진 지급(itemId "grant") · 시즌 패스 보상(itemId "season-pass")처럼 돌려줄 값이 없는 건.
//    운영진 지급 회수(app/api/admin/items/grant PATCH) · 관리자 유저 조회 인벤토리 회수(app/api/admin/users/inventory)가 같은 함수를 쓴다.
//    · 봇이 아직 안 붙인 대기 건 → cancelled(processedAt)
//    · 보유 중인 건 → refunded(revokedAt · processedAt) + roleDetached false — 봇 processRefunds 가 다른 근거가 없을 때 역할을 떼고,
//      낸 값이 없어 환불 DM 은 보내지 않는다(bot/src/features/grantQueue.js). 인벤토리 · 효과는 바로 빠진다
//    · 📌 이미 봇이 역할을 뗀 사이트 보유 건(siteOnly · roleDetached)은 roleDetached 를 그대로 둔다 — 회수를 다시 걸지 않는다
//      (역할 이전 도구 · 봇 만료와 같은 규칙: 그 사이 다른 경로로 다시 받은 같은 역할을 떼지 않게)
//    · 조건: 대기 · 완료, 소모 안 됨(consumedAt null). 조건부 갱신이라 두 번 눌러도 한 번만 바뀐다
//    상점 구매(낸 값 있음)는 여기서 하지 않는다 — lib/orderRefund.js settleOrders(낸 값 반환)
//    connectToDatabase() 뒤에 부른다.

/**
 * @param {{ ids: string[], userId?: string, extra?: object|null, at?: Date }} opts
 *   userId: 주면 그 유저의 건만 · extra: 더할 조건(예: { itemId: "grant", adminNote: { $not: TOOL_RE } })
 * 반환: { cancelled, refunded, done }
 */
export async function revokeFreeRows({ ids, userId = "", extra = null, at = new Date() }) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map((v) => String(v || "")))].filter((v) => mongoose.isValidObjectId(v));
  if (!list.length) return { cancelled: 0, refunded: 0, done: 0 };
  const base = { ...(extra || {}), _id: { $in: list }, consumedAt: null, ...(userId ? { userId: String(userId) } : {}) };
  const detached = { siteOnly: true, roleDetached: true };

  const cancelled = await Purchase.updateMany({ ...base, status: "pending" }, { $set: { status: "cancelled", processedAt: at } });
  // 보유 중 — 역할을 아직 들고 있을 수 있는 건은 봇 큐가 집어 가게(roleDetached false), 이미 뗀 사이트 보유 건은 그대로
  const revoked = await Purchase.updateMany(
    { $and: [{ ...base, status: "completed" }, { $nor: [detached] }] },
    { $set: { status: "refunded", revokedAt: at, processedAt: at, roleDetached: false } }
  );
  const kept = await Purchase.updateMany(
    { $and: [{ ...base, status: "completed" }, detached] },
    { $set: { status: "refunded", revokedAt: at, processedAt: at } }
  );
  const c = cancelled.modifiedCount || 0;
  const r = (revoked.modifiedCount || 0) + (kept.modifiedCount || 0);
  return { cancelled: c, refunded: r, done: c + r };
}
