export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isSupporterSession } from "@/lib/supporters";
import SupporterReaction from "@/models/SupporterReaction";
import Post from "@/models/Post";

// 📌 누를 수 있는 이모지 — 화면의 반응 바와 같은 목록. 여기 없는 값은 400.
const REACTION_EMOJIS = ["👍", "✅", "🔥", "👀", "🙏", "❤️"];

// 로그인 → 서포터즈 순으로 거른다 (/api/supporters/acks 와 같은 규칙)
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

// 한 공지의 반응을 { emoji: { count, mine } } 로 접는다 — 화면이 바로 그릴 수 있는 모양
async function summarize(postId, userId) {
  const rows = await SupporterReaction.find({ postId }, { emoji: 1, userId: 1 }).lean();
  const out = {};
  for (const e of REACTION_EMOJIS) out[e] = { count: 0, mine: false };
  for (const r of rows) {
    if (!out[r.emoji]) continue; // 화이트리스트에서 빠진 옛 이모지는 세지 않는다
    out[r.emoji].count += 1;
    if (r.userId === userId) out[r.emoji].mine = true;
  }
  return out;
}

// ── [조회] ?postId= → { success, emojis, reactions: { emoji: { count, mine } } } ──
export async function GET(request) {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const postId = str(new URL(request.url).searchParams.get("postId") || "", 32);
    if (!mongoose.isValidObjectId(postId)) {
      return NextResponse.json({ success: false, error: "공지를 확인해 주세요." }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      emojis: REACTION_EMOJIS,
      reactions: await summarize(postId, g.session.user.id),
    });
  } catch (e) {
    console.error("서포터즈 반응 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [토글] body { postId, emoji } → 있으면 지우고 없으면 넣는다 → { success, on, reactions } ──
export async function POST(request) {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const b = await request.json().catch(() => ({}));
    const postId = str(b.postId, 32);
    const emoji = str(b.emoji, 8);
    if (!mongoose.isValidObjectId(postId)) {
      return NextResponse.json({ success: false, error: "공지를 확인해 주세요." }, { status: 400 });
    }
    if (!REACTION_EMOJIS.includes(emoji)) {
      return NextResponse.json({ success: false, error: "쓸 수 없는 이모지입니다." }, { status: 400 });
    }

    // 확인 체크와 같은 기준 — 서포터즈 공지이면서 공개된 글에만
    const exists = await Post.exists({
      _id: postId,
      category: "서포터즈",
      hidden: { $ne: true },
      $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }],
    });
    if (!exists) {
      return NextResponse.json({ success: false, error: "서포터즈 공지를 찾을 수 없습니다." }, { status: 404 });
    }

    const userId = g.session.user.id;
    // 토글 — 지워지면 꺼진 것, 안 지워졌으면 새로 넣는다(동시 연타는 유니크 인덱스가 한 건으로 막는다)
    const removed = await SupporterReaction.deleteOne({ postId, userId, emoji });
    let on = false;
    if (!removed.deletedCount) {
      try {
        await SupporterReaction.create({ postId, userId, emoji });
        on = true;
      } catch (e) {
        if (e?.code !== 11000) throw e;
        on = true;
      }
    }
    return NextResponse.json({ success: true, on, reactions: await summarize(postId, userId) });
  } catch (e) {
    console.error("서포터즈 반응 저장 오류:", e);
    return NextResponse.json({ success: false, error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
