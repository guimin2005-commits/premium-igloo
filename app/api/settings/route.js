export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin, forgetMaintenanceCache } from "@/lib/apiAuth";
import Setting from "@/models/Setting";

export async function GET() {
  try {
    await connectToDatabase();
    const maintenance = await Setting.findOne({ key: "maintenance" }).lean();
    return NextResponse.json({ success: true, maintenance: !!maintenance?.value });
  } catch (e) {
    return NextResponse.json({ success: true, maintenance: false });
  }
}

// 점검 모드 토글 — 사이트 전체를 잠그는 동작이므로 관리자만
export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { maintenance } = await request.json();
    await Setting.findOneAndUpdate(
      { key: "maintenance" },
      { value: !!maintenance, updatedAt: new Date() },
      { upsert: true }
    );
    // 📌 쓰기 API 점검 가드(denyIfMaintenance)의 10초 캐시를 비운다 — 같은 서버에서는 바로 반영
    forgetMaintenanceCache();
    return NextResponse.json({ success: true, maintenance: !!maintenance });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
