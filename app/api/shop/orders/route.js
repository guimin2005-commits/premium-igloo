export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";
import { getLevelByXp } from "@/lib/leveling";
import { logWallet } from "@/lib/wallet";
import ShopItem from "@/models/ShopItem";
import mongoose from "mongoose";

// ── [조회] 전체 구매 내역 (관리자) ──
export async function GET(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    const status = sp.get("status");
    const filter = status && ["pending", "completed", "cancelled", "refunded"].includes(status) ? { status } : {};

    // 📌 1개 단위 상품은 1개가 한 건이라 건 수가 빨리 는다 — 화면이 주문(orderId + 상품)으로 묶어 보여 주므로 넉넉히 읽는다
    const [rows, pendingCount] = await Promise.all([
      Purchase.find(filter).sort({ createdAt: -1 }).limit(500).lean(),
      Purchase.countDocuments({ status: "pending" }),
    ]);
    return NextResponse.json({ success: true, data: rows, pendingCount });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [처리] 발송 완료 / 취소(환불) (관리자) ──
//    { id } 한 건 또는 { ids: [...] } 여러 건(최대 99) — 1개 단위 상품은 1개가 한 건이라 관리자 주문 목록이
//    한 줄(orderId + 상품)의 건들을 골라 한 번에 보낸다. 건마다 아래 처리를 그대로 돌린다(조건부 상태 전환 → 환불 → 캐시백 회수 → 재고).
//    📌 한 요청으로 처리한 건은 processedAt · revokedAt 이 모두 같다 — 원장(app/api/xp/ledger)이 같은 주문 · 같은 시각끼리 한 줄로 묶는다
//    📌 이미 쓴 건(consumedAt — 쓴 소모권 · 보호막)은 취소 · 환불하지 않는다. 예외가 필요하면 XP 수동 지급으로 돌려준다
//    응답: { success, data: 처리한 첫 건(옛 화면용), done: 처리 수, skipped: 건너뛴 수(이미 처리 · 이미 사용) }
const MAX_IDS = 99;

export async function PATCH(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { id, ids, status, adminNote } = await request.json();
    const list = [...new Set((Array.isArray(ids) ? ids : id ? [id] : []).map((v) => String(v || "")))]
      .filter((v) => mongoose.isValidObjectId(v))
      .slice(0, MAX_IDS);
    if (!list.length || !["completed", "cancelled", "refunded"].includes(status)) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    // 📌 상태 전이는 두 갈래다.
    //    pending   → completed(발송) | cancelled(취소·환불)
    //    completed → refunded(환불) — 역할 상품은 봇이 30초 안에 completed 로 바꾸므로
    //    pending 만 취소할 수 있으면 관리자가 실제로 환불할 창이 거의 없다.
    //    조건에 이전 상태를 넣어 두 번 눌러도 두 번 환불되지 않게 한다.
    const fromStatus = status === "refunded" ? "completed" : "pending";
    const giveBack = status === "cancelled" || status === "refunded";
    const at = new Date();
    const done = [];
    const levelUsers = new Set(); // XP 가 돌아온 유저 — 레벨은 끝에 한 번만 다시 계산한다
    const claws = new Map(); // 캐시백 회수 — 주문 · 상품별 합(원장 한 줄). n: 돌려준 개수

    for (const pid of list) {
      const purchase = await Purchase.findOneAndUpdate(
        // 돌려주는 처리는 쓰지 않은 건만 — 봇 · 관리자 소모(consumedAt 조건부)와 동시에 와도 한쪽만 된다
        { _id: pid, status: fromStatus, ...(giveBack ? { consumedAt: null } : {}) },
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
      //    📌 price 는 쿠폰 적용 전 정가라 그대로 돌려주면 과다 환불이 된다.
      //       실제 결제한 금액(paidXp/paidPoint)을 그 지갑으로 되돌린다. 둘 다 낸 화폐 단위 그대로라
      //       (빙옥은 1 빙옥 = 1,000 XP 로 환산해 뺀 값) 다시 환산하지 않는다.
      //       옛 기록에는 두 필드가 없으므로 그때만 price 로 떨어진다.
      //       📌 billed 건은 몫이 0 이어도 그 값을 믿는다 — 빙옥은 몫이 작아 장바구니 한 줄이 0 이 될 수 있고,
      //          100% 쿠폰도 0 이다. 여기서 price(XP)로 떨어지면 내지 않은 XP 를 돌려주게 된다.
      const hasSplit = !!purchase.billed || (purchase.paidXp || 0) > 0 || (purchase.paidPoint || 0) > 0;
      const paidBackXp = hasSplit ? purchase.paidXp || 0 : purchase.price || 0;
      const backPoint = hasSplit ? purchase.paidPoint || 0 : 0;
      // 📌 캐시백 회수 — 결제 때 돌려준 캐시백(cashbackXp)은 환불할 XP 에서 뺀다. 캐시백은 낸 XP 의 일부(상한 30%)라
      //    돌려줄 XP 보다 클 수 없지만, 혹시 커도 돌려줄 XP 까지만 뺀다 — 환불로 지갑이 0 아래로 내려가지 않게
      const claw = Math.min(Math.max(0, Math.floor(Number(purchase.cashbackXp) || 0)), paidBackXp);
      const backXp = paidBackXp - claw;
      const inc = {};
      // 차감 때 기준선(passBaseXp)을 함께 내렸으므로 환불도 같은 폭으로 되돌린다.
      //    한쪽만 움직이면 시즌 패스 진행도가 환불할 때마다 부풀어 오른다. (캐시백도 기준선과 함께 올렸으므로 같은 순액)
      if (backXp) { inc.xp = backXp; inc.passBaseXp = backXp; }
      if (backPoint) inc.point = backPoint;
      if (Object.keys(inc).length) await UserXp.updateOne({ userId: purchase.userId }, { $inc: inc });
      // 회수한 캐시백은 원장에 따로 남긴다 — 환불(+paidXp)은 구매 기록이 세고, 여기서는 캐시백만 되돌린다.
      //    📌 같은 주문 · 같은 상품(1개 단위 여러 개)은 한 줄로 — 요청 끝에 합쳐 적는다(원장의 "환불 · 이름 ×N" 한 줄과 짝)
      const ck = purchase.orderId ? `o:${purchase.userId}|${purchase.orderId}|${purchase.itemId}` : `p:${purchase._id}`;
      const c = claws.get(ck) || { userId: purchase.userId, name: purchase.itemName || "상품", refId: String(purchase._id), amount: 0, n: 0 };
      c.amount += claw;
      c.n += 1;
      claws.set(ck, c);
      if (backXp) levelUsers.add(purchase.userId);
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

    // XP 가 돌아오면 레벨이 오를 수 있다 — 봇이 보상 역할을 다시 맞추도록 표시한다
    for (const userId of levelUsers) {
      const refunded = await UserXp.findOne({ userId }, { xp: 1 }).lean();
      await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(refunded?.xp ?? 0), needsRoleSync: true } });
    }

    if (!done.length) {
      // 하나도 못 했으면 이유를 가른다 — 이미 쓴 건이 섞였으면 그 이유를 먼저
      const used = giveBack ? await Purchase.exists({ _id: { $in: list }, status: fromStatus, consumedAt: { $ne: null } }) : null;
      return NextResponse.json({ success: false, message: used ? "이미 사용한 상품입니다." : "이미 처리된 구매입니다." }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: done[0], done: done.length, skipped: list.length - done.length });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
