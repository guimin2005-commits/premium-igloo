export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser, denyIfMaintenance } from "@/lib/apiAuth";
import { getPerks } from "@/lib/itemPerks";
import { SKIN_OF, SKIN_NONE, pickCardSkin, withSeasonSkin } from "@/lib/itemEffects";
import UserXp from "@/models/UserXp";

// 📌 카드 스킨 착용 · 해제 — 인벤토리 상세의 버튼이 부른다.
//    POST { skin }  skin: 스킨 키(착용) · "none"(해제 — 기본 카드)
//    가진 스킨만 착용할 수 있다(보유 판정은 lib/itemPerks getPerks — 인벤토리 · 봇과 같은 규칙) + 시즌 등급 카드 스킨(UserXp.seasonFrame 등급 — withSeasonSkin).
//    저장은 UserXp.cardSkinPick 하나 — 봇이 이미지 카드(레벨업 · /레벨 · /랭크 · /출석체크)를 그릴 때 읽는다.
//    반환: { cardSkin } — 지금 쓰는 스킨 키("" 이면 기본 카드)
export async function POST(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    const maint = await denyIfMaintenance(auth.session);
    if (maint) return maint;
    if (!auth.userId) return NextResponse.json({ success: false, error: "디스코드 계정을 확인할 수 없습니다." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const skin = String(body?.skin ?? "").trim().toLowerCase();
    if (skin !== SKIN_NONE && !SKIN_OF[skin]) {
      return NextResponse.json({ success: false, error: "알 수 없는 스킨입니다." }, { status: 400 });
    }

    await connectToDatabase();
    const [perks, mine] = await Promise.all([getPerks(auth.userId), UserXp.findOne({ userId: auth.userId }, { seasonFrame: 1 }).lean()]);
    const cardSkins = withSeasonSkin(perks.cardSkins, mine);
    if (skin !== SKIN_NONE && !cardSkins.includes(skin)) {
      return NextResponse.json({ success: false, error: "가지고 있지 않은 스킨입니다." }, { status: 403 });
    }

    // XP 문서가 없는 유저(채팅 한 번 안 함 · 지급으로만 받음)는 쓰기인 여기서 만든다(시즌 패스 수령과 같은 규칙 — 조회 경로는 만들지 않는다)
    const set = { $set: { cardSkinPick: skin } };
    await UserXp.updateOne({ userId: auth.userId }, set, { upsert: true }).catch(async (e) => {
      if (e?.code !== 11000) throw e;
      await UserXp.updateOne({ userId: auth.userId }, set); // 경합 — 다른 요청이 먼저 만들었으면 그 문서에
    });
    return NextResponse.json({ success: true, data: { cardSkin: pickCardSkin(cardSkins, skin) } });
  } catch (error) {
    console.error("카드 스킨 저장 실패:", error);
    return NextResponse.json({ success: false, error: "저장하지 못했습니다." }, { status: 500 });
  }
}
