export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { normalizeItemPayload, itemSnapshot } from "@/lib/items";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import SeasonPass from "@/models/SeasonPass";

// 시즌 패스 티어 보상이 이 아이템을 몇 번 쓰는지 — 삭제 409 와 목록 표시에 쓴다
async function passUsageOf() {
  const pass = await SeasonPass.findOne({ key: "main" }, { tiers: 1 }).lean();
  const count = new Map();
  for (const t of pass?.tiers || []) {
    for (const r of [t.free, t.paid]) {
      if (r?.kind === "item" && r.itemId) count.set(String(r.itemId), (count.get(String(r.itemId)) || 0) + 1);
    }
  }
  return count;
}

// 📌 아이템 등록 CRUD — 관리자 전용. 인벤토리 / 상점 상품 / 시즌 패스 보상 표기의 원천.
const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};

// ── [조회] 전체 목록 — ?withUsage=1 이면 이 아이템을 쓰는 상품 수를 함께 준다 ──
export async function GET(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const withUsage = new URL(request.url).searchParams.get("withUsage") === "1";
    const rows = await Item.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();

    if (withUsage) {
      const usage = await ShopItem.aggregate([
        { $match: { itemId: { $ne: "" } } },
        { $group: { _id: "$itemId", count: { $sum: 1 } } },
      ]);
      const countOf = new Map(usage.map((u) => [String(u._id), u.count]));
      const passOf = await passUsageOf();
      for (const r of rows) {
        r.usage = countOf.get(String(r._id)) || 0;
        r.passUsage = passOf.get(String(r._id)) || 0;
      }
    }
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    console.error("아이템 목록 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [등록·수정] { id?, ...fields } upsert ──
//    수정 시 이 아이템을 참조하는 상품(ShopItem.itemId)의 스냅샷도 함께 갱신한다.
export async function POST(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));
    const n = normalizeItemPayload(b);
    if (!n.ok) return NextResponse.json({ success: false, message: n.error }, { status: 400 });

    const id = String(b?.id || "").trim();
    let doc;
    if (id) {
      doc = await Item.findByIdAndUpdate(id, { $set: n.data }, { new: true, runValidators: true }).lean();
      if (!doc) return NextResponse.json({ success: false, message: "아이템을 찾을 수 없습니다." }, { status: 404 });
      // 상품이 들고 있는 표기 스냅샷을 새 값으로 맞춘다 — 상점 카드·인벤토리가 함께 바뀐다.
      //    기프트카드가 되면 기간제 가격표는 뜻이 없으므로 같이 비운다 (상품 POST 경로와 같은 규칙)
      const snap = itemSnapshot(doc);
      if (doc.type === "physical") snap.durations = [];
      await ShopItem.updateMany({ itemId: id }, { $set: snap });
    } else {
      doc = (await Item.create(n.data)).toObject();
    }
    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    console.error("아이템 저장 오류:", e);
    return NextResponse.json({ success: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [삭제] ?id= — 참조 상품이 있으면 409 ──
export async function DELETE(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const id = String(new URL(request.url).searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ success: false, message: "삭제할 아이템을 지정해 주세요." }, { status: 400 });

    const used = await ShopItem.countDocuments({ itemId: id });
    if (used > 0) {
      return NextResponse.json(
        { success: false, message: `이 아이템을 쓰는 상품 ${used}개를 먼저 정리해 주세요.`, usage: used },
        { status: 409 }
      );
    }
    const passUsed = (await passUsageOf()).get(id) || 0;
    if (passUsed > 0) {
      return NextResponse.json(
        { success: false, message: `이 아이템을 보상으로 쓰는 시즌 패스 티어 ${passUsed}개를 먼저 정리해 주세요.`, passUsage: passUsed },
        { status: 409 }
      );
    }
    await Item.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("아이템 삭제 오류:", e);
    return NextResponse.json({ success: false, message: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
