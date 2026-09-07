export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import SupporterReport from "@/models/SupporterReport";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};
const denied = () => NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });

const STATUSES = ["open", "done"];
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 관리자 화면 모양 — 본인용(/api/supporters/reports)과 같되 작성자 식별자를 덧붙인다
const pick = (r) => ({
  _id: String(r._id),
  userId: r.userId,
  userName: r.userName || "",
  type: r.type,
  target: r.target || "",
  content: r.content || "",
  status: r.status === "done" ? "done" : "open",
  adminReply: r.adminReply || "",
  repliedAt: r.repliedAt || null,
  createdAt: r.createdAt,
});

// ── [조회] 신고·피드백 목록 — ?status=open|done|all (기본 open), 최신 200건 + 상태별 건수 ──
export async function GET(request) {
  try {
    if (!(await requireAdmin())) return denied();
    await connectToDatabase();

    const sp = new URL(request.url).searchParams;
    const status = sp.get("status") || "open";
    if (status !== "all" && !STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: "상태 값이 올바르지 않습니다." }, { status: 400 });
    }
    const filter = status === "all" ? {} : { status };

    // 건수는 탭 배지용이라 필터와 무관하게 항상 둘 다 센다
    const [rows, open, done] = await Promise.all([
      SupporterReport.find(filter).sort({ createdAt: -1 }).limit(200).lean(),
      SupporterReport.countDocuments({ status: "open" }),
      SupporterReport.countDocuments({ status: "done" }),
    ]);

    return NextResponse.json({ success: true, reports: rows.map(pick), counts: { open, done } });
  } catch (e) {
    console.error("서포터즈 제출함 목록 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [처리] 상태 변경·답변 — body { id, status?, adminReply? } ──
//    adminReply 를 보내면 repliedAt 을 지금으로 굳힌다(빈 문자열로 지우는 것도 답변 갱신으로 본다).
export async function PATCH(request) {
  try {
    if (!(await requireAdmin())) return denied();
    await connectToDatabase();

    const b = await request.json().catch(() => ({}));
    const id = str(b.id, 32);
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: "대상을 확인해 주세요." }, { status: 400 });
    }

    const $set = {};
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) {
        return NextResponse.json({ success: false, error: "상태 값이 올바르지 않습니다." }, { status: 400 });
      }
      $set.status = b.status;
    }
    if (b.adminReply !== undefined) {
      if (typeof b.adminReply !== "string") {
        return NextResponse.json({ success: false, error: "답변 형식이 올바르지 않습니다." }, { status: 400 });
      }
      $set.adminReply = str(b.adminReply, 2000);
      $set.repliedAt = new Date();
    }
    if (!Object.keys($set).length) {
      return NextResponse.json({ success: false, error: "변경할 내용이 없습니다." }, { status: 400 });
    }

    const doc = await SupporterReport.findByIdAndUpdate(id, { $set }, { new: true }).lean();
    if (!doc) {
      return NextResponse.json({ success: false, error: "해당 건을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ success: true, report: pick(doc) });
  } catch (e) {
    console.error("서포터즈 제출함 처리 오류:", e);
    return NextResponse.json({ success: false, error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
