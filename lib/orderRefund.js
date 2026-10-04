import mongoose from "mongoose";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";
import ShopItem from "@/models/ShopItem";
import Coupon from "@/models/Coupon";
import UserCoupon from "@/models/UserCoupon";
import { getLevelByXp } from "@/lib/leveling";
import { logWallet } from "@/lib/wallet";
import { couponReleaseUpdate } from "@/lib/shopPricing";

// 📌 상점 주문 처리 — 발송 완료 / 취소 · 환불. 관리자 주문 처리(app/api/shop/orders PATCH) · 관리자 유저 조회 인벤토리 회수
//    (app/api/admin/users/inventory POST 의 상점 구매 건)가 같은 함수를 쓴다. connectToDatabase() 뒤에 부른다.
//    📌 상태 전이는 두 갈래다.
//       pending   → completed(발송) | cancelled(취소·환불)
//       completed → refunded(환불) — 역할 상품은 봇이 30초 안에 completed 로 바꾸므로
//       pending 만 취소할 수 있으면 관리자가 실제로 환불할 창이 거의 없다.
//       조건에 이전 상태를 넣어 두 번 눌러도 두 번 환불되지 않게 한다.
//    📌 한 번 부른 건은 processedAt · revokedAt 이 모두 at — 원장(app/api/xp/ledger)이 같은 주문 · 같은 시각끼리 한 줄로 묶는다
//    📌 이미 쓴 건(consumedAt — 쓴 소모권 · 보호막)은 취소 · 환불하지 않는다

// 돌려줄 값 — 결제한 값(paidXp / paidPoint)에서 캐시백을 뺀 순액. 인벤토리 회수 화면의 금액도 이 값이다(lib/inventory.js)
//    📌 price 는 쿠폰 적용 전 정가라 그대로 돌려주면 과다 환불이 된다.
//       실제 결제한 금액(paidXp/paidPoint)을 그 지갑으로 되돌린다. 둘 다 낸 화폐 단위 그대로라
//       (빙옥은 1 빙옥 = 10,000 XP 로 환산해 뺀 값) 다시 환산하지 않는다.
//       옛 기록에는 두 필드가 없으므로 그때만 price 로 떨어진다.
//       📌 billed 건은 몫이 0 이어도 그 값을 믿는다 — 빙옥은 몫이 작아 장바구니 한 줄이 0 이 될 수 있고,
//          100% 쿠폰도 0 이다. 여기서 price(XP)로 떨어지면 내지 않은 XP 를 돌려주게 된다.
//    📌 캐시백 회수 — 결제 때 돌려준 캐시백(cashbackXp)은 환불할 XP 에서 뺀다(claw). 환불로 지갑이 0 아래로 내려가지 않게 돌려줄 XP 까지만.
//       빙옥으로 낸 몫에도 캐시백을 주면(관리자 설정 — lib/itemEffects cashbackRuleOf onPoint) 캐시백이 돌려줄 XP 보다 클 수 있다 —
//       남는 몫(clawRest)은 settleOrders 가 지갑 XP 에서 있는 만큼만 뺀다
//    반환: { xp: 돌려줄 XP(캐시백 뺀 값), point: 돌려줄 빙옥, claw: 환불 XP 에서 뺄 캐시백, clawRest: 지갑에서 따로 뺄 캐시백 }
export function refundValueOf(purchase) {
  const hasSplit = !!purchase.billed || (purchase.paidXp || 0) > 0 || (purchase.paidPoint || 0) > 0;
  const paidBackXp = hasSplit ? purchase.paidXp || 0 : purchase.price || 0;
  const backPoint = hasSplit ? purchase.paidPoint || 0 : 0;
  const cashback = Math.max(0, Math.floor(Number(purchase.cashbackXp) || 0));
  const claw = Math.min(cashback, paidBackXp);
  return { xp: paidBackXp - claw, point: backPoint, claw, clawRest: cashback - claw };
}

// 📌 돌려줄 XP 로 다 못 뺀 캐시백 — 지갑 XP 에서 있는 만큼만 뺀다(0 아래로 내리지 않는다). 캐시백 때 기준선(passBaseXp)도 같이 올렸으므로 같은 폭으로 내린다.
//    읽은 뒤 그 사이 XP 가 뺄 값보다 줄었으면 다시 읽는다(최대 3번). 실제로 뺀 XP 를 돌려준다
async function clawFromWallet(userId, want) {
  for (let i = 0; i < 3; i++) {
    const w = await UserXp.findOne({ userId }, { xp: 1 }).lean();
    const cut = Math.min(want, Math.max(0, Math.floor(Number(w?.xp) || 0)));
    if (cut <= 0) return 0;
    const r = await UserXp.updateOne({ userId, xp: { $gte: cut } }, { $inc: { xp: -cut, passBaseXp: -cut } });
    if (r.modifiedCount) return cut;
  }
  return 0;
}

// 📌 주문에 쓴 쿠폰 돌려주기 — 2026-10-04 "바꿔라": 주문 전체를 취소 · 환불하면 그 주문에 쓴 쿠폰도 다시 쓸 수 있게 돌려준다.
//    일부만 돌려준 주문은 쿠폰을 쓴 채로 둔다(지금처럼) — 남은 건까지 돌려줘 주문 전체가 취소 · 환불이 되는 그때 돌려준다.
//    · 주문 = 같은 유저 · 같은 orderId 의 건 전부. 하나라도 대기 · 완료 · 만료로 남아 있으면 일부 환불이다
//    · 쿠폰은 장바구니 결제가 건마다 적어 둔 Purchase.couponId(app/api/shop/checkout). 없는 옛 주문은 어떤 쿠폰을 썼는지 몰라 돌려주지 않는다
//    · 한 번만 — 주문 첫 건(_id 순)에 couponBackAt 을 조건부로 세운 요청만 돌려준다(두 요청이 각자 마지막 건을 처리해도 한 번)
//    · 사용 기록(usedCount · usedBy)을 한 번 되돌리고(couponReleaseUpdate — 결제 실패 때와 같은 갱신),
//      지갑에서 쓴 쿠폰이면 지갑에 다시 넣는다(같은 쿠폰을 안 쓴 채 또 가졌으면 지갑에 두 장이 되지 않게 두지 않는다)
async function returnOrderCoupon({ userId, orderId, couponId }) {
  if (!mongoose.isValidObjectId(couponId)) return false;
  const rows = await Purchase.find({ userId, orderId }, { status: 1 }).sort({ _id: 1 }).lean();
  if (!rows.length || rows.some((r) => r.status !== "cancelled" && r.status !== "refunded")) return false;
  const claim = await Purchase.updateOne({ _id: rows[0]._id, couponBackAt: null }, { $set: { couponBackAt: new Date() } });
  if (!claim.modifiedCount) return false;
  await Coupon.updateOne({ _id: couponId }, couponReleaseUpdate(userId), { updatePipeline: true });
  const cid = String(couponId);
  if (!(await UserCoupon.exists({ userId, couponId: cid, status: "unused" }))) {
    await UserCoupon.findOneAndUpdate({ userId, couponId: cid, status: "used" }, { $set: { status: "unused" }, $unset: { usedAt: 1 } }, { sort: { usedAt: -1 } });
  }
  return true;
}

/**
 * 건마다 조건부 상태 전환 → (취소 · 환불이면) 낸 값 반환 → 캐시백 회수 → 재고 · 판매 수 복구, 끝에 레벨 재계산.
 * @param {{ ids: string[], status: "completed"|"cancelled"|"refunded", adminNote?: any, match?: object|null, at?: Date }} opts
 *   match: 건 조건에 더할 것(예: { userId }) — 상태 · consumedAt 조건은 덮지 못한다
 * 반환: { done: 바꾼 건(새 값), fromStatus, giveBack, refundXp, refundPoint }
 */
export async function settleOrders({ ids, status, adminNote = "", match = null, at = new Date() }) {
  const fromStatus = status === "refunded" ? "completed" : "pending";
  const giveBack = status === "cancelled" || status === "refunded";
  const done = [];
  const levelUsers = new Set(); // XP 가 돌아온 유저 — 레벨은 끝에 한 번만 다시 계산한다
  const claws = new Map(); // 캐시백 회수 — 주문 · 상품별 합(원장 한 줄). n: 돌려준 개수
  let refundXp = 0;
  let refundPoint = 0;

  for (const pid of ids) {
    const purchase = await Purchase.findOneAndUpdate(
      // 돌려주는 처리는 쓰지 않은 건만 — 봇 · 관리자 소모(consumedAt 조건부)와 동시에 와도 한쪽만 된다
      { ...(match || {}), _id: pid, status: fromStatus, ...(giveBack ? { consumedAt: null } : {}) },
      {
        status,
        adminNote: (adminNote || "").trim(),
        processedAt: at,
        // 환불은 봇이 디스코드 역할을 떼야 끝난다 — roleDetached 를 내려 큐가 집어 가게 한다
        ...(status === "refunded" ? { revokedAt: at, roleDetached: false } : {}),
      },
      { new: true }
    );
    if (!purchase) continue;
    done.push(purchase);
    if (!giveBack) continue;

    // 취소 시 환불 + 재고 복구 (환불로 레벨이 다시 올라갈 수 있다)
    const { xp: backXp, point: backPoint, claw, clawRest } = refundValueOf(purchase);
    const inc = {};
    // 차감 때 기준선(passBaseXp)을 함께 내렸으므로 환불도 같은 폭으로 되돌린다.
    //    한쪽만 움직이면 시즌 패스 진행도가 환불할 때마다 부풀어 오른다. (캐시백도 기준선과 함께 올렸으므로 같은 순액)
    if (backXp) { inc.xp = backXp; inc.passBaseXp = backXp; }
    if (backPoint) inc.point = backPoint;
    if (Object.keys(inc).length) await UserXp.updateOne({ userId: purchase.userId }, { $inc: inc });
    refundXp += backXp;
    refundPoint += backPoint;
    // 돌려줄 XP 로 다 못 뺀 캐시백(빙옥 몫 캐시백) — 지갑 XP 에서 있는 만큼
    const rest = clawRest > 0 ? await clawFromWallet(purchase.userId, clawRest) : 0;
    // 회수한 캐시백은 원장에 따로 남긴다 — 환불(+paidXp)은 구매 기록이 세고, 여기서는 캐시백만 되돌린다.
    //    📌 같은 주문 · 같은 상품(1개 단위 여러 개)은 한 줄로 — 끝에 합쳐 적는다(원장의 "환불 · 이름 ×N" 한 줄과 짝)
    const ck = purchase.orderId ? `o:${purchase.userId}|${purchase.orderId}|${purchase.itemId}` : `p:${purchase._id}`;
    const c = claws.get(ck) || { userId: purchase.userId, name: purchase.itemName || "상품", refId: String(purchase._id), amount: 0, n: 0 };
    c.amount += claw + rest;
    c.n += 1;
    claws.set(ck, c);
    if (backXp || rest) levelUsers.add(purchase.userId);
    // 📌 시즌 패스 보상으로 지급한 건은 itemId 가 ObjectId 가 아니라 "season-pass" 문자열이다.
    //    그대로 _id 로 넘기면 CastError 로 500 이 나는데, 취소는 이미 반영된 뒤라
    //    관리자 화면은 실패로 보이고 실제로는 취소된 유령 상태가 된다. 상점 상품일 때만 재고를 되돌린다.
    //    재고와 판매 수는 따로 되돌린다 — 한 조건(stock >= 0)으로 묶으면 무제한(-1) 상품은 판매 수가 줄지 않아 인기순이 부풀려진다
    if (mongoose.Types.ObjectId.isValid(purchase.itemId)) {
      await ShopItem.updateOne({ _id: purchase.itemId, stock: { $gte: 0 } }, { $inc: { stock: 1 } });
      await ShopItem.updateOne({ _id: purchase.itemId, soldCount: { $gt: 0 } }, { $inc: { soldCount: -1 } });
    }
  }

  for (const c of claws.values()) {
    if (c.amount <= 0) continue;
    await logWallet({
      userId: c.userId,
      currency: "xp",
      amount: -c.amount,
      kind: "cashback",
      label: `캐시백 회수 · ${c.name}${c.n > 1 ? ` ×${c.n}` : ""}`,
      refId: c.refId,
    });
  }

  // 📌 주문 전체를 돌려줬으면 그 주문에 쓴 쿠폰도 돌려준다(returnOrderCoupon). 실패해도 환불은 끝난 것이라 막지 않는다
  if (giveBack) {
    const orders = new Map();
    for (const p of done) {
      if (p.orderId && p.couponId) orders.set(`${p.userId}|${p.orderId}`, { userId: p.userId, orderId: p.orderId, couponId: p.couponId });
    }
    for (const o of orders.values()) {
      await returnOrderCoupon(o).catch((e) => console.error("주문 쿠폰 반환 실패:", o.orderId, e?.message || e));
    }
  }

  // XP 가 돌아오면 레벨이 오를 수 있다 — 봇이 보상 역할을 다시 맞추도록 표시한다(캐시백을 지갑에서 뺐으면 내려갈 수도 있다)
  for (const userId of levelUsers) {
    const refunded = await UserXp.findOne({ userId }, { xp: 1 }).lean();
    await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(refunded?.xp ?? 0), needsRoleSync: true } });
  }

  return { done, fromStatus, giveBack, refundXp, refundPoint };
}
