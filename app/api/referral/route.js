export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Referral from "@/models/Referral";
import Payout from "@/models/Payout";

// 친구 초대 보상 정책 (XP)
const INVITER_REWARD = 10000; // 초대한 사람
const INVITEE_REWARD = 5000;  // 코드를 입력한 사람
// 누적 초대 마일스톤 추가 보너스 (해당 인원 도달 시 1회 지급)
const MILESTONE_BONUS = { 3: 30000, 5: 50000, 10: 150000 };

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
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");
    const userId = searchParams.get("userId");
    if (!user) return NextResponse.json({ success: false, error: "유저 정보가 없습니다." }, { status: 400 });

    const doc = await getOrCreate(user, userId);
    return NextResponse.json({
      success: true,
      data: { code: doc.code, invites: doc.invitees.length, invitees: doc.invitees, hasUsed: !!doc.referredBy },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [사용] 친구의 초대 코드 입력
export async function POST(request) {
  try {
    await connectToDatabase();
    const { code, userId, userName } = await request.json();
    if (!code || !code.trim() || !userName) {
      return NextResponse.json({ success: false, message: "코드를 입력해 주세요." }, { status: 400 });
    }

    const normalized = code.trim().toUpperCase();
    const me = await getOrCreate(userName, userId);

    if (me.referredBy) {
      return NextResponse.json({ success: false, message: "이미 친구 초대 코드를 입력하셨습니다." }, { status: 409 });
    }
    if (me.code === normalized) {
      return NextResponse.json({ success: false, message: "본인의 코드는 사용할 수 없습니다." }, { status: 400 });
    }

    const owner = await Referral.findOne({ code: normalized });
    if (!owner) {
      return NextResponse.json({ success: false, message: "유효하지 않은 초대 코드입니다." }, { status: 404 });
    }

    owner.invitees.push(userName);
    me.referredBy = normalized;
    await owner.save();
    await me.save();

    // XP 지급 대기열 생성 (관리자 대시보드에서 지급 처리)
    const inviteCount = owner.invitees.length;
    const payouts = [
      { userName: owner.userName, userId: owner.userId, amount: INVITER_REWARD, reason: `친구 초대 보상 (${userName} 초대)`, source: "referral" },
      { userName: userName, userId: userId || "", amount: INVITEE_REWARD, reason: `초대 코드 입력 웰컴 보상 (${owner.userName}님 코드)`, source: "referral" },
    ];
    if (MILESTONE_BONUS[inviteCount]) {
      payouts.push({ userName: owner.userName, userId: owner.userId, amount: MILESTONE_BONUS[inviteCount], reason: `누적 ${inviteCount}명 초대 마일스톤 보너스`, source: "referral" });
    }
    try { await Payout.insertMany(payouts); } catch { /* 지급 대기 생성 실패해도 초대는 유효 */ }

    return NextResponse.json({
      success: true,
      message: `${owner.userName}님의 초대가 확인되었습니다!\n초대 보상이 양쪽 모두에게 지급됩니다.`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
