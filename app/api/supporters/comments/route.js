export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isSupporterSession } from "@/lib/supporters";
import { isAdminName } from "@/lib/admins";
import { kstDayStart } from "@/lib/kst";
import SupporterComment from "@/models/SupporterComment";
import Post from "@/models/Post";

const MAX_LEN = 1000;
const PAGE = 200;        // 한 공지에 내려보내는 최대 댓글 수 — 그 이상은 대화가 아니라 도배
const DAILY_LIMIT = 100; // 한 사람이 하루(KST)에 쓸 수 있는 건수 — 실수 연타·스팸 방지

// 로그인 → 서포터즈 순으로 거른다 (/api/supporters/acks 와 같은 규칙).
//    userId 가 비면 빈 문자열끼리 남의 댓글이 "내 것"으로 보이므로 id 없는 세션은 로그인으로 취급하지 않는다
async function gate() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name || !session.user.id) {
    return { deny: NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  if (!isSupporterSession(session)) {
    return { deny: NextResponse.json({ success: false, error: "서포터즈 전용입니다." }, { status: 403 }) };
  }
  return { session, admin: isAdminName(session.user.name) };
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 댓글을 달 수 있는 공지 — 서포터즈 카테고리이면서, 관리자가 아니면 가린 글·예약 발행 전 글은 제외.
//    관리자는 ?all=1 로 가린 글도 열어 보므로 거기서도 댓글이 돌아가야 한다.
const postFilter = (admin, extra = {}) =>
  admin
    ? { category: "서포터즈", ...extra }
    : { category: "서포터즈", hidden: { $ne: true }, $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }], ...extra };

// 화면에 내려가는 모양 — mine 은 지우기 버튼을 보일지 정하는 근거(관리자는 mine 과 무관하게 지울 수 있다)
const pick = (c, meId) => ({
  _id: String(c._id),
  userId: c.userId,
  userName: c.userName || "",
  userImage: c.userImage || "",
  content: c.content || "",
  createdAt: c.createdAt,
  mine: c.userId === meId,
});

const notFound = () => NextResponse.json({ success: false, error: "서포터즈 공지를 찾을 수 없습니다." }, { status: 404 });

// ── [조회] ?postId= 한 공지의 댓글(오래된 순, 최대 200) · ?counts=1 공지별 댓글 수 ──
export async function GET(request) {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const sp = new URL(request.url).searchParams;
    const meId = g.session.user.id;

    // 공지 목록 배지용 — 서포터즈 공지 전체를 키로 싣는다(댓글 0건인 공지도 0 으로). 보이는 글 기준은 조회와 같다
    if (sp.get("counts") === "1") {
      const posts = await Post.find(postFilter(g.admin), { _id: 1 }).lean();
      const ids = posts.map((p) => String(p._id));
      const counts = {};
      for (const id of ids) counts[id] = 0;
      const rows = ids.length
        ? await SupporterComment.aggregate([
            { $match: { postId: { $in: ids } } },
            { $group: { _id: "$postId", n: { $sum: 1 } } },
          ])
        : [];
      for (const r of rows) if (r._id in counts) counts[r._id] = r.n;
      return NextResponse.json({ success: true, counts });
    }

    const postId = str(sp.get("postId") || "", 32);
    if (!mongoose.isValidObjectId(postId)) {
      return NextResponse.json({ success: false, error: "공지를 확인해 주세요." }, { status: 400 });
    }
    if (!(await Post.exists(postFilter(g.admin, { _id: postId })))) return notFound();

    const rows = await SupporterComment.find({ postId }).sort({ createdAt: 1 }).limit(PAGE).lean();
    return NextResponse.json({ success: true, comments: rows.map((c) => pick(c, meId)) });
  } catch (e) {
    console.error("서포터즈 공지 댓글 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [작성] body { postId, content } — 하루 100건을 넘기면 429 ──
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
    // 한 글자 넘겨 자른 뒤 길이를 재야 "1000자 초과"를 잘라낸 결과가 아니라 초과 그 자체로 잡는다
    const content = str(b.content, MAX_LEN + 1);
    if (!content || content.length > MAX_LEN) {
      return NextResponse.json({ success: false, error: `댓글은 1~${MAX_LEN}자로 적어 주세요.` }, { status: 400 });
    }
    if (!(await Post.exists(postFilter(g.admin, { _id: postId })))) return notFound();

    const userId = g.session.user.id;
    const todayCount = await SupporterComment.countDocuments({ userId, createdAt: { $gte: kstDayStart() } });
    if (todayCount >= DAILY_LIMIT) {
      return NextResponse.json(
        { success: false, error: `하루 ${DAILY_LIMIT}건까지 쓸 수 있습니다. 내일 다시 시도해 주세요.` },
        { status: 429 }
      );
    }

    const doc = await SupporterComment.create({
      postId,
      userId,
      userName: g.session.user.name || "",
      userImage: g.session.user.image || "",
      content,
    });
    return NextResponse.json({ success: true, comment: pick(doc, userId) });
  } catch (e) {
    console.error("서포터즈 공지 댓글 작성 오류:", e);
    return NextResponse.json({ success: false, error: "작성 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [삭제] ?id= — 본인 것 또는 관리자. 남의 것은 403, 없는 것은 404 ──
//    조건부 삭제 한 방 대신 먼저 읽는 이유: "남의 것"과 "없는 것"을 갈라 답하려면 문서를 봐야 한다
export async function DELETE(request) {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const id = str(new URL(request.url).searchParams.get("id") || "", 32);
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: "대상을 확인해 주세요." }, { status: 400 });
    }

    const cur = await SupporterComment.findById(id, { userId: 1 }).lean();
    if (!cur) {
      return NextResponse.json({ success: false, error: "댓글을 찾을 수 없습니다." }, { status: 404 });
    }
    if (cur.userId !== g.session.user.id && !g.admin) {
      return NextResponse.json({ success: false, error: "본인 댓글만 지울 수 있습니다." }, { status: 403 });
    }

    await SupporterComment.deleteOne({ _id: id });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("서포터즈 공지 댓글 삭제 오류:", e);
    return NextResponse.json({ success: false, error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
