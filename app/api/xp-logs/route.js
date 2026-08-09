export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import XpLog from "@/models/XpLog";

// ── [조회] XP 지급 로그 (관리자 전용, 페이지네이션 + 필터) ──
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }

    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50));
    const skip = Math.max(0, parseInt(sp.get("skip") || "0", 10) || 0);
    const reason = sp.get("reason");
    const q = sp.get("q");

    const filter = {};
    if (reason && ["chat", "voice", "attend"].includes(reason)) filter.reason = reason;
    if (q?.trim()) {
      // 사용자명 부분 일치 (정규식 특수문자는 이스케이프)
      const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.displayName = { $regex: safe, $options: "i" };
    }

    const [rows, total] = await Promise.all([
      XpLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      XpLog.countDocuments(filter),
    ]);

    return NextResponse.json({ success: true, data: rows, total });
  } catch (e) {
    console.error("XP 로그 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], total: 0 }, { status: 500 });
  }
}
