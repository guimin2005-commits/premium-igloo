export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getShopAccess } from "@/lib/shopAccess";
import { salePrice, isTimed, durationPrice } from "@/lib/shopPricing";
import { getLevelByXp } from "@/lib/leveling";
import ShopItem from "@/models/ShopItem";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";

// ── [구매] 본인 XP를 소모해 상품 구매 ──
//    역할 상품은 봇이 큐(status:pending)를 보고 자동 지급, 실물은 관리자가 발송 처리
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();

    // 공개 전에는 관리자만 구매 가능 (테스트용)
    const { canView, isAdmin } = await getShopAccess();
    if (!canView) {
      return NextResponse.json({ success: false, message: "아직 공개되지 않은 상점입니다." }, { status: 403 });
    }

    const { itemId, contact, days: rawDays } = await request.json();
    if (!itemId) {
      return NextResponse.json({ success: false, message: "상품이 지정되지 않았습니다." }, { status: 400 });
    }

    const item = await ShopItem.findById(itemId);
    if (!item || !item.active) {
      return NextResponse.json({ success: false, message: "판매 중인 상품이 아닙니다." }, { status: 404 });
    }
    if (item.type === "physical" && !contact?.trim()) {
      return NextResponse.json({ success: false, message: "수령 정보를 입력해주세요." }, { status: 400 });
    }

    // 📌 기간제 상품은 파는 기간 중 하나를 반드시 골라야 한다
    const days = isTimed(item) ? Math.floor(Number(rawDays) || 0) : 0;
    if (isTimed(item) && (!days || durationPrice(item, days) == null)) {
      return NextResponse.json({ success: false, message: "이용 기간을 골라주세요." }, { status: 400 });
    }

    // 📌 모든 상품은 1인 1개 — 이미 구매(대기·완료)한 건이 있으면 재구매 불가
    // 기간제는 기간이 끝나면 다시 살 수 있어야 하므로, 아직 살아 있는 건만 막는다
    const owned = await Purchase.findOne({
      userId,
      itemId: String(item._id),
      status: { $in: ["pending", "completed"] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).lean();
    if (owned) {
      return NextResponse.json({
        success: false,
        message: owned.expiresAt ? "아직 이용 기간이 남아 있습니다. 기간이 끝난 뒤 다시 구매할 수 있습니다." : "이미 구매한 상품입니다. 상품은 1인 1개만 구매할 수 있습니다.",
      }, { status: 409 });
    }

    // 1) 재고 선점 — 무제한(-1)이 아니면 남은 수량이 있을 때만 차감
    if (item.stock >= 0) {
      const claimed = await ShopItem.updateOne(
        { _id: item._id, stock: { $gt: 0 } },
        { $inc: { stock: -1, soldCount: 1 } }
      );
      if (!claimed.modifiedCount) {
        return NextResponse.json({ success: false, message: "품절된 상품입니다." }, { status: 409 });
      }
    } else {
      await ShopItem.updateOne({ _id: item._id }, { $inc: { soldCount: 1 } });
    }

    // 2) XP 차감 — XP는 화폐이므로 쓰면 레벨도 함께 내려간다.
    //    잔액이 충분할 때만 매치되는 원자적 갱신 (중복 구매·마이너스 방지)
    //    📌 관리자는 잔액 검사를 건너뛰고 소모도 하지 않는다 (테스트 구매)
    const price = salePrice(item, days);
    const charged = isAdmin ? 0 : price;
    const paid = await UserXp.updateOne(
      isAdmin ? { userId } : { userId, xp: { $gte: price } },
      { $inc: { xp: -charged }, $set: { updatedAt: new Date() } },
      isAdmin ? { upsert: true } : {}
    );
    if (!paid.matchedCount && !paid.upsertedCount) {
      // 결제 실패 → 선점한 재고 원복
      const rollback = item.stock >= 0
        ? { $inc: { stock: 1, soldCount: -1 } }
        : { $inc: { soldCount: -1 } };
      await ShopItem.updateOne({ _id: item._id }, rollback);
      return NextResponse.json({ success: false, message: "보유 XP가 부족합니다." }, { status: 400 });
    }

    // 3) 구매 기록 (봇/관리자가 처리할 대기 건)
    const purchase = await Purchase.create({
      userId,
      userName: session.user.name || "",
      itemId: String(item._id),
      itemName: item.name,
      itemType: item.type,
      roleId: item.roleId || "",
      price,
      days,
      // 만료 시각은 결제 시점부터 — 봇 지급이 늦어도 산 만큼은 보장된다
      expiresAt: days > 0 ? new Date(Date.now() + days * 86400000) : null,
      contact: item.type === "physical" ? contact.trim() : "",
      status: "pending",
    });

    // 차감된 XP에 맞춰 레벨을 다시 계산 (레벨이 내려갈 수 있다)
    const doc = await UserXp.findOne({ userId }, { xp: 1 }).lean();
    const newLevel = getLevelByXp(doc?.xp ?? 0);
    // 레벨이 내려갔을 수 있으니 봇이 보상 역할을 다시 맞추도록 표시한다
    await UserXp.updateOne({ userId }, { $set: { level: newLevel, needsRoleSync: true } });
    const remain = { xp: doc?.xp ?? 0, level: newLevel };

    return NextResponse.json({
      success: true,
      message: item.type !== "physical"
        ? (days > 0 ? `구매가 완료되었습니다. ${days}일 동안 역할이 유지되며, 잠시 후 자동으로 지급됩니다.` : "구매가 완료되었습니다. 잠시 후 역할이 자동으로 지급됩니다.")
        : "구매가 완료되었습니다. 운영진 확인 후 발송해 드립니다.",
      data: { purchaseId: purchase._id, remainXp: remain?.xp ?? 0 },
    });
  } catch (e) {
    console.error("구매 처리 오류:", e);
    return NextResponse.json({ success: false, message: "구매 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [조회] 내 구매 내역 ──
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, data: [] }, { status: 401 });
    }
    await connectToDatabase();
    const rows = await Purchase.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}
