export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser, denyIfMaintenance } from "@/lib/apiAuth";
import { getPerks } from "@/lib/itemPerks";
import { FRAME_OF, SKIN_NONE, pickAvatarFrame } from "@/lib/itemEffects";
import UserXp from "@/models/UserXp";

// 📌 아바타 테두리 착용 · 해제 — 인벤토리 상세의 버튼이 부른다(카드 스킨 app/api/xp/card-skin 과 같은 모양).
//    POST { frame }  frame: 테두리 키(착용 — 등급 키) · "none"(해제)
//    가진 테두리만 착용할 수 있다(보유 판정은 lib/itemPerks getPerks — 인벤토리 · 봇과 같은 규칙).
//    저장은 UserXp.avatarFramePick 하나. 반환: { avatarFrame } — 지금 쓰는 테두리 키("" 이면 없음)
export async function POST(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    const maint = await denyIfMaintenance(auth.session);
    if (maint) return maint;
    if (!auth.userId) return NextResponse.json({ success: false, error: "디스코드 계정을 확인할 수 없습니다." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const frame = String(body?.frame ?? "").trim().toLowerCase();
    if (frame !== SKIN_NONE && !FRAME_OF[frame]) {
      return NextResponse.json({ success: false, error: "알 수 없는 테두리입니다." }, { status: 400 });
    }

    await connectToDatabase();
    const { avatarFrames } = await getPerks(auth.userId);
    if (frame !== SKIN_NONE && !avatarFrames.includes(frame)) {
      return NextResponse.json({ success: false, error: "가지고 있지 않은 테두리입니다." }, { status: 403 });
    }

    // XP 문서가 없는 유저(지급으로만 받음)는 쓰기인 여기서 만든다(카드 스킨과 같은 규칙)
    const set = { $set: { avatarFramePick: frame } };
    await UserXp.updateOne({ userId: auth.userId }, set, { upsert: true }).catch(async (e) => {
      if (e?.code !== 11000) throw e;
      await UserXp.updateOne({ userId: auth.userId }, set); // 경합 — 다른 요청이 먼저 만들었으면 그 문서에
    });
    return NextResponse.json({ success: true, data: { avatarFrame: pickAvatarFrame(avatarFrames, frame) } });
  } catch (error) {
    console.error("아바타 테두리 저장 실패:", error);
    return NextResponse.json({ success: false, error: "저장하지 못했습니다." }, { status: 500 });
  }
}
