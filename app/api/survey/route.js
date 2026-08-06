export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import Post from "@/models/Post";
import SurveyResponse from "@/models/SurveyResponse";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";

// [조회] ?postId=... — 본인 제출 여부 / 관리자는 전체 응답
export async function GET(request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("postId");
    if (!postId) return NextResponse.json({ success: false, message: "postId가 필요합니다." }, { status: 400 });

    const session = await getServerSession(authOptions);
    const isAdmin = isAdminName(session?.user?.name);

    if (isAdmin && searchParams.get("all") === "1") {
      const list = await SurveyResponse.find({ postId }).sort({ createdAt: -1 });
      return NextResponse.json({ success: true, data: list, count: list.length });
    }

    // 일반 유저: 본인 제출 여부만
    const userId = session?.user?.id;
    const mine = userId ? await SurveyResponse.findOne({ postId, userId }) : null;
    const count = await SurveyResponse.countDocuments({ postId });
    return NextResponse.json({ success: true, mine, count });
  } catch (e) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// [제출] 설문 응답 저장
export async function POST(request) {
  try {
    await connectToDatabase();
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });

    const { postId, answers } = await request.json();
    if (!postId) return NextResponse.json({ success: false, message: "postId가 필요합니다." }, { status: 400 });

    const post = await Post.findById(postId);
    if (!post || !post.survey?.enabled) {
      return NextResponse.json({ success: false, message: "설문이 열려 있지 않습니다." }, { status: 400 });
    }
    if (post.survey.closed) {
      return NextResponse.json({ success: false, message: "설문 접수가 마감되었습니다." }, { status: 403 });
    }

    const userId = session.user.id || "";
    if (userId) {
      const dup = await SurveyResponse.findOne({ postId, userId });
      if (dup) return NextResponse.json({ success: false, message: "이미 제출한 설문입니다." }, { status: 409 });
    }

    // 필수 항목 검증 (서버에서도 확인)
    const byId = new Map((answers || []).map((a) => [a.qid, a]));
    for (const q of post.survey.questions) {
      if (!q.required) continue;
      const v = byId.get(q.qid)?.value;
      const empty = v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
      if (empty) return NextResponse.json({ success: false, message: `필수 항목을 입력해주세요: ${q.label}` }, { status: 400 });
    }

    const saved = await SurveyResponse.create({
      postId,
      userId,
      userName: session.user.name || "",
      avatar: session.user.image || "",
      answers: post.survey.questions.map((q) => ({
        qid: q.qid,
        label: q.label,
        type: q.type,
        value: byId.get(q.qid)?.value ?? (q.type === "multi" ? [] : ""),
      })),
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (e) {
    if (e?.code === 11000) return NextResponse.json({ success: false, message: "이미 제출한 설문입니다." }, { status: 409 });
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// [삭제] 관리자 — 응답 삭제
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, message: "관리자만 삭제할 수 있습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await SurveyResponse.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
