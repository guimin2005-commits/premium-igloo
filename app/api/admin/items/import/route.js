export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { normalizeColor } from "@/lib/items";
import Item from "@/models/Item";
import InventoryRole from "@/models/InventoryRole";

// 📌 예전 '인벤토리 표기 역할'(InventoryRole)을 아이템으로 가져온다.
//    roleId 기준 idempotent — 이미 같은 roleId 의 Item 이 있으면 건너뛴다.
//    category perk → type "perk", 그 외(title/notify/etc) → type "item".
//    가져온 InventoryRole 은 지우지 않고 visible=false 로만 내린다 (my-items 의 호환 fallback 이 더는 잡지 않게).
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();

    const [rows, existing] = await Promise.all([
      InventoryRole.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean(),
      Item.find({ roleId: { $ne: "" } }, { roleId: 1 }).lean(),
    ]);
    const have = new Set(existing.map((i) => i.roleId));

    let imported = 0;
    let skipped = 0;
    const importedIds = [];
    for (const r of rows) {
      if (!r.roleId || have.has(r.roleId)) { skipped++; continue; }
      const name = (r.label || r.roleName || "역할").trim().slice(0, 40) || "역할";
      await Item.create({
        name,
        description: String(r.description || "").slice(0, 120),
        icon: "",
        imageUrl: "",
        color: normalizeColor(r.color),
        type: r.category === "perk" ? "perk" : "item",
        roleId: r.roleId,
        roleName: String(r.roleName || "").slice(0, 60),
        detachOnSeason: false,
        visible: r.visible !== false,
        sortOrder: Number(r.sortOrder) || 0,
      });
      have.add(r.roleId);
      importedIds.push(r._id);
      imported++;
    }
    if (importedIds.length > 0) {
      await InventoryRole.updateMany({ _id: { $in: importedIds } }, { $set: { visible: false } });
    }
    return NextResponse.json({ success: true, imported, skipped });
  } catch (e) {
    console.error("표기 역할 가져오기 오류:", e);
    return NextResponse.json({ success: false, message: "가져오는 중 오류가 발생했습니다." }, { status: 500 });
  }
}
