export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser, denyIfMaintenance } from "@/lib/apiAuth";
import { getPerks } from "@/lib/itemPerks";
import { SCENE_OF, SKIN_NONE, pickCardScene } from "@/lib/itemEffects";
import UserXp from "@/models/UserXp";

// 📌 카드 배경 착용 · 해제 — 인벤토리가 부른다(카드 스킨 app/api/xp/card-skin · 아바타 테두리 app/api/xp/avatar-frame 과 같은 모양).
//    POST { scene }  scene: 배경 키(착용 — sc_*) · "none"(해제)
//    가진 배경만 착용할 수 있다(보유 판정은 lib/itemPerks getPerks — 인벤토리 · 봇과 같은 규칙). 카드 테두리(cardSkinPick)와 따로 고르고 함께 입는다.
//    저장은 UserXp.cardScenePick 하나 — 봇이 이미지 카드를 그릴 때 읽는다. 반환: { cardScene } — 지금 쓰는 배경 키("" 이면 없음)
export async function POST(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    const maint = await denyIfMaintenance(auth.session);
    if (maint) return maint;
    if (!auth.userId) return NextResponse.json({ success: false, error: "디스코드 계정을 확인할 수 없습니다." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const scene = String(body?.scene ?? "").trim().toLowerCase();
    if (scene !== SKIN_NONE && !SCENE_OF[scene]) {
      return NextResponse.json({ success: false, error: "알 수 없는 카드 배경입니다." }, { status: 400 });
    }

    await connectToDatabase();
    const perks = await getPerks(auth.userId);
    const cardScenes = Array.isArray(perks.cardScenes) ? perks.cardScenes : [];
    if (scene !== SKIN_NONE && !cardScenes.includes(scene)) {
      return NextResponse.json({ success: false, error: "가지고 있지 않은 카드 배경입니다." }, { status: 403 });
    }

    // XP 문서가 없는 유저(지급으로만 받음)는 쓰기인 여기서 만든다(카드 스킨과 같은 규칙)
    const set = { $set: { cardScenePick: scene } };
    await UserXp.updateOne({ userId: auth.userId }, set, { upsert: true }).catch(async (e) => {
      if (e?.code !== 11000) throw e;
      await UserXp.updateOne({ userId: auth.userId }, set); // 경합 — 다른 요청이 먼저 만들었으면 그 문서에
    });
    return NextResponse.json({ success: true, data: { cardScene: pickCardScene(cardScenes, scene) } });
  } catch (error) {
    console.error("카드 배경 저장 실패:", error);
    return NextResponse.json({ success: false, error: "저장하지 못했습니다." }, { status: 500 });
  }
}
