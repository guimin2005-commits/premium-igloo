export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getPassState } from "@/lib/seasonPass";

// ── [조회] 내 시즌 패스 진행도 ──
//    진행도·해금·수령 여부는 전부 서버가 계산한다. 화면은 받은 그대로 그리기만 하면 된다.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const state = await getPassState(session.user.id);
    return NextResponse.json({ success: true, ...state });
  } catch (e) {
    console.error("시즌 패스 조회 오류:", e);
    return NextResponse.json({ success: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
