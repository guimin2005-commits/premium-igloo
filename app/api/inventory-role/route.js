export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import InventoryRole from "@/models/InventoryRole";

// 📌 인벤토리 역할 CRUD — 관리자 전용 (role-config 라우트와 같은 형태)

const CATEGORIES = ["perk", "title", "notify", "etc"];

export async function GET() {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;
  await connectToDatabase();
  const data = await InventoryRole.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
  return NextResponse.json({ success: true, data });
}

export async function POST(request) {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;
  const b = await request.json().catch(() => ({}));
  const roleId = String(b?.roleId || "").trim();
  if (!roleId) {
    return NextResponse.json({ success: false, error: "역할을 선택해 주세요." }, { status: 400 });
  }

  await connectToDatabase();
  const saved = await InventoryRole.findOneAndUpdate(
    { roleId },
    {
      $set: {
        roleName: String(b?.roleName || "").slice(0, 60),
        label: String(b?.label || "").trim().slice(0, 40),
        category: CATEGORIES.includes(b?.category) ? b.category : "perk",
        description: String(b?.description || "").trim().slice(0, 120),
        color: /^#[0-9a-fA-F]{6}$/.test(b?.color || "") ? b.color : "",
        sortOrder: Number.isFinite(Number(b?.sortOrder)) ? Math.max(0, Math.min(999, Math.round(Number(b.sortOrder)))) : 0,
        visible: b?.visible !== false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return NextResponse.json({ success: true, data: saved });
}

export async function DELETE(request) {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "삭제할 항목을 지정해 주세요." }, { status: 400 });
  }
  await connectToDatabase();
  await InventoryRole.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
