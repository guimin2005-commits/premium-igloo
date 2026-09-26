export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireSelfOrAdmin } from "@/lib/apiAuth";
import Referral from "@/models/Referral";

// 고유 코드 생성 (혼동되는 문자 제외)
const genCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

// 호출자의 초대 정보 조회 (없으면 코드 자동 발급)
async function getOrCreate(userName, userId) {
  let doc = await Referral.findOne({ userName });
  if (!doc) {
    let code;
    for (let i = 0; i < 5; i++) {
      code = genCode();
      if (!(await Referral.findOne({ code }))) break;
    }
    doc = await Referral.create({ userName, userId: userId || "", code });
  } else if (userId && doc.userId !== userId) {
    doc.userId = userId;
    await doc.save();
  }
  return doc;
}

// [조회] 내 초대 코드 / 누적 초대 수 / 코드 사용 여부
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");
    if (!user) return NextResponse.json({ success: false, error: "유저 정보가 없습니다." }, { status: 400 });

    // 남의 초대 내역을 들여다보지 못하게 본인(또는 관리자)만 허용
    const auth = await requireSelfOrAdmin(user);
    if (auth.deny) return auth.deny;

    await connectToDatabase();
    const doc = await getOrCreate(user, auth.isAdmin ? searchParams.get("userId") : auth.userId);
    return NextResponse.json({
      success: true,
      data: { code: doc.code, invites: doc.invitees.length, invitees: doc.invitees, hasUsed: !!doc.referredBy },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [사용] 친구 초대 이벤트는 폐기됐다(next.config.ts /invite 리다이렉트) — 기록 조회(GET)만 남기고 지급 경로는 닫는다.
//    열어 두면 부계정 · 동시 요청으로 초대 보상과 마일스톤 XP 가 끝없이 찍혀 나온다.
//    되살린다면 referredBy 를 조건부 갱신으로 먼저 선점하고(userId 기준) 선점에 성공한 요청만 지급할 것.
export async function POST() {
  return NextResponse.json({ success: false, message: "친구 초대 이벤트가 종료되었습니다." }, { status: 410 });
}
