export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getShopAccess } from "@/lib/shopAccess";
import { salePrice } from "@/lib/shopPricing";
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

    const { itemId, contact } = await request.json();
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

    // 2) XP 차감 — 잔액이 충분할 때만 매치되는 원자적 갱신 (중복 구매·마이너스 방지)
    //    📌 관리자는 잔액 검사를 건너뛴다 (상점 동작 확인용 테스트 구매)
    const price = salePrice(item);
    const paid = await UserXp.updateOne(
      isAdmin ? { userId } : { userId, xp: { $gte: price } },
      { $inc: { xp: -price }, $set: { updatedAt: new Date() } },
      isAdmin ? { upsert: true } : {}
    );
    if (!paid.modifiedCount && !paid.upsertedCount) {
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
      contact: item.type === "physical" ? contact.trim() : "",
      status: "pending",
    });

    const remain = await UserXp.findOne({ userId }, { xp: 1 }).lean();

    return NextResponse.json({
      success: true,
      message: item.type === "role"
        ? "구매가 완료되었습니다. 잠시 후 역할이 자동으로 지급됩니다."
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
