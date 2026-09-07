export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { getSupporterSettings, fetchRoleHolders } from "@/lib/supporters";
import SupporterAck from "@/models/SupporterAck";
import Post from "@/models/Post";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};
const denied = () => NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });

// ── [조회] 서포터즈 공지별 확인 현황 — 공지 전체를 키로 싣는다(확인 0건인 공지도 count 0 으로) ──
//    total 은 관리자 표와 같은 역할 보유자 명단(10분 캐시)에서 센다. ?refresh=1 이면 캐시를 무시한다.
//    디스코드 조회가 실패해도 확인 현황은 보여야 하므로 그때는 total 을 null 로 두고 message 를 덧붙인다.
export async function GET(request) {
  try {
    if (!(await requireAdmin())) return denied();
    await connectToDatabase();

    const sp = new URL(request.url).searchParams;

    const [posts, settings] = await Promise.all([
      Post.find({ category: "서포터즈" }, { _id: 1 }).lean(),
      getSupporterSettings(),
    ]);
    const ids = posts.map((p) => String(p._id));

    const byPost = {};
    for (const id of ids) byPost[id] = { count: 0, users: [] };

    // 먼저 확인한 사람이 앞에 오도록
    const acks = ids.length
      ? await SupporterAck.find({ postId: { $in: ids } }).sort({ createdAt: 1 }).lean()
      : [];
    for (const a of acks) {
      const slot = byPost[a.postId];
      if (!slot) continue;
      slot.count += 1;
      slot.users.push({ userId: a.userId, userName: a.userName || "", at: a.createdAt });
    }

    let total = 0;
    let message;
    if (!settings.roleId) {
      message = "서포터즈 역할이 지정되지 않았습니다";
    } else {
      try {
        total = (await fetchRoleHolders(settings.roleId, sp.get("refresh") === "1")).length;
      } catch (e) {
        total = null;
        message = e?.message || "디스코드 멤버 목록을 불러오지 못했습니다.";
      }
    }

    return NextResponse.json({ success: true, total, byPost, ...(message ? { message } : {}) });
  } catch (e) {
    console.error("서포터즈 공지 확인 현황 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
