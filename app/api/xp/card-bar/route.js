export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser, denyIfMaintenance } from "@/lib/apiAuth";
import { getPerks } from "@/lib/itemPerks";
import { BAR_OF, SKIN_NONE, pickCardBar } from "@/lib/itemEffects";
import UserXp from "@/models/UserXp";

// 📌 레벨바 착용 · 해제(2026-10-31 운영자 "카드 배경과 레벨바 디자인을 분리 · 따로 착용") — 인벤토리가 부른다(카드 배경 app/api/xp/card-scene 과 같은 모양).
//    POST { bar }  bar: 막대 키(착용 — bar_*) · "none"(해제 — 기본 막대)
//    가진 막대만 착용할 수 있다(가진 배경의 짝 막대 포함 — lib/itemEffects perksOfItems cardBars). 저장은 UserXp.cardBarPick 하나 — 봇이 이미지 카드를 그릴 때 읽는다.
//    반환: { cardBar, cardBarPick } — cardBar = 지금 보이는 막대 키("" 기본 막대 · pickCardBar), cardBarPick = 저장한 값
export async function POST(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    const maint = await denyIfMaintenance(auth.session);
    if (maint) return maint;
    if (!auth.userId) return NextResponse.json({ success: false, error: "디스코드 계정을 확인할 수 없습니다." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const bar = String(body?.bar ?? "").trim().toLowerCase();
    if (bar !== SKIN_NONE && !BAR_OF[bar]) {
      return NextResponse.json({ success: false, error: "알 수 없는 레벨바입니다." }, { status: 400 });
    }

    await connectToDatabase();
    const perks = await getPerks(auth.userId);
    const cardBars = Array.isArray(perks.cardBars) ? perks.cardBars : [];
    if (bar !== SKIN_NONE && !cardBars.includes(bar)) {
      return NextResponse.json({ success: false, error: "가지고 있지 않은 레벨바입니다." }, { status: 403 });
    }

    // XP 문서가 없는 유저(지급으로만 받음)는 쓰기인 여기서 만든다(카드 스킨과 같은 규칙)
    const set = { $set: { cardBarPick: bar } };
    await UserXp.updateOne({ userId: auth.userId }, set, { upsert: true }).catch(async (e) => {
      if (e?.code !== 11000) throw e;
      await UserXp.updateOne({ userId: auth.userId }, set); // 경합 — 다른 요청이 먼저 만들었으면 그 문서에
    });
    return NextResponse.json({ success: true, data: { cardBar: pickCardBar(cardBars, bar), cardBarPick: bar } });
  } catch (error) {
    console.error("레벨바 저장 실패:", error);
    return NextResponse.json({ success: false, error: "저장하지 못했습니다." }, { status: 500 });
  }
}
