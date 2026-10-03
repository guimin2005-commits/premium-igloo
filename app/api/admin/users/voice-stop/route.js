export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import UserXp from "@/models/UserXp";

// 📌 음성 XP 정지 — 관리 › 유저 조회 상세 칸 [음성 정지] · [정지 해제] (관리자 전용)
//    POST { userId, off: boolean } → UserXp.voiceXpOff · 정지한 시각 · 관리자(voiceXpOffAt · voiceXpOffBy — 해제하면 비운다)
//    정지된 유저에게 봇은 음성 XP 를 주지 않는다 — XpLog 가 안 쌓여 음성 시간 · 음성 출석 · 음성 퀘스트/패스 진행도 같이 멈춘다
//    응답: { success, message, data: { off } }
const SNOWFLAKE = /^\d{5,25}$/;

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    const b = await request.json().catch(() => ({}));
    const userId = String(b?.userId || "").trim();
    if (!SNOWFLAKE.test(userId) || typeof b?.off !== "boolean") {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }
    const off = b.off;
    await connectToDatabase();

    // 📌 strict:false — 스키마가 캐시된 서버(재시작 전)에서도 새 칸이 조용히 버려지지 않게
    const r = await UserXp.updateOne(
      { userId },
      { $set: off ? { voiceXpOff: true, voiceXpOffAt: new Date(), voiceXpOffBy: auth.name || "admin" } : { voiceXpOff: false, voiceXpOffAt: null, voiceXpOffBy: "" } },
      { strict: false }
    );
    if (!r.matchedCount) {
      return NextResponse.json({ success: false, message: "XP 기록이 없는 유저입니다." }, { status: 404 });
    }
    console.log(`🔇 음성 XP ${off ? "정지" : "정지 해제"}: ${userId} · ${auth.name || "admin"}`);
    return NextResponse.json({
      success: true,
      message: off ? "음성 XP를 정지했습니다." : "음성 XP 정지를 풀었습니다.",
      data: { off },
    });
  } catch (e) {
    console.error("음성 XP 정지 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
