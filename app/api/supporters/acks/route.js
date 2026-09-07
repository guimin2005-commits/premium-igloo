export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isSupporterSession } from "@/lib/supporters";
import SupporterAck from "@/models/SupporterAck";
import Post from "@/models/Post";

// 로그인 → 서포터즈 순으로 거른다 (/api/supporters/reports 와 같은 규칙).
//    userId 가 비면 빈 문자열끼리 남의 확인 표시가 섞이므로 id 없는 세션은 로그인으로 취급하지 않는다
async function gate() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name || !session.user.id) {
    return { deny: NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  if (!isSupporterSession(session)) {
    return { deny: NextResponse.json({ success: false, error: "서포터즈 전용입니다." }, { status: 403 }) };
  }
  return { session };
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ── [조회] 내가 확인 표시한 공지 id 목록 ──
export async function GET() {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const rows = await SupporterAck.find({ userId: g.session.user.id }, { postId: 1 }).lean();
    return NextResponse.json({ success: true, postIds: rows.map((r) => r.postId) });
  } catch (e) {
    console.error("서포터즈 공지 확인 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [토글] 확인 표시 켜기·끄기 — body { postId, on: boolean } ──
//    서포터즈 공지가 아닌 글(다른 카테고리·없는 글)에는 표시를 남기지 않는다(404).
export async function POST(request) {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const b = await request.json().catch(() => ({}));
    const postId = str(b.postId, 32);
    if (!mongoose.isValidObjectId(postId)) {
      return NextResponse.json({ success: false, error: "공지를 확인해 주세요." }, { status: 400 });
    }
    if (typeof b.on !== "boolean") {
      return NextResponse.json({ success: false, error: "확인 여부가 올바르지 않습니다." }, { status: 400 });
    }
    const on = b.on;

    const exists = await Post.exists({ _id: postId, category: "서포터즈" , hidden: { $ne: true }, $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }] });
    if (!exists) {
      return NextResponse.json({ success: false, error: "서포터즈 공지를 찾을 수 없습니다." }, { status: 404 });
    }

    const userId = g.session.user.id;
    if (on) {
      // 이미 있으면 그대로 둔다($setOnInsert 만) — 처음 확인한 시각을 보존하기 위해
      try {
        await SupporterAck.updateOne(
          { postId, userId },
          { $setOnInsert: { postId, userId, userName: g.session.user.name || "", createdAt: new Date() } },
          { upsert: true }
        );
      } catch (e) {
        // 같은 사람이 동시에 두 번 눌러 upsert 가 둘 다 삽입을 시도하면 유니크 인덱스가 하나를 막는다 — 결과는 같으니 성공으로
        if (e?.code !== 11000) throw e;
      }
    } else {
      await SupporterAck.deleteOne({ postId, userId });
    }

    return NextResponse.json({ success: true, on });
  } catch (e) {
    console.error("서포터즈 공지 확인 저장 오류:", e);
    return NextResponse.json({ success: false, error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
