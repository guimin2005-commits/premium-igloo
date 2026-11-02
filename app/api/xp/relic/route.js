export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser, denyIfMaintenance } from "@/lib/apiAuth";
import { getPerks } from "@/lib/itemPerks";
import { normPick } from "@/lib/relic/meta";
import UserXp from "@/models/UserXp";

// 📌 유물 착용 · 꾸미기 저장 · 해제(2026-11-02 「사건의 지평선」) — 인벤토리 [착용] · 꾸미기 창 [적용]이 부른다(레벨바 app/api/xp/card-bar 와 같은 모양).
//    POST { pick: { key, core, frame, border, bg, bar } } — 입기(고른 값 저장) · POST { off: true } — 벗기
//    가진 유물만(lib/itemEffects perksOfItems relics — 효과 on:"relic"). 저장은 UserXp.relicPick 하나. 다른 꾸미기 고른 값은 건드리지 않는다(유물이 가린다)
//    반환: { relic } — 지금 입은 값(벗었으면 null)
export async function POST(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    const maint = await denyIfMaintenance(auth.session);
    if (maint) return maint;
    if (!auth.userId) return NextResponse.json({ success: false, error: "디스코드 계정을 확인할 수 없습니다." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const off = body?.off === true;
    const pick = off ? null : normPick(body?.pick);

    await connectToDatabase();
    if (pick) {
      const perks = await getPerks(auth.userId);
      if (!(Array.isArray(perks.relics) ? perks.relics : []).includes(pick.key)) {
        return NextResponse.json({ success: false, error: "가지고 있지 않은 유물입니다." }, { status: 403 });
      }
    }
    // XP 문서가 없는 유저(지급으로만 받음)는 쓰기인 여기서 만든다(카드 스킨과 같은 규칙)
    const set = pick ? { $set: { relicPick: pick } } : { $unset: { relicPick: 1 } };
    await UserXp.updateOne({ userId: auth.userId }, set, { upsert: !!pick }).catch(async (e) => {
      if (e?.code !== 11000) throw e;
      await UserXp.updateOne({ userId: auth.userId }, set); // 경합 — 다른 요청이 먼저 만들었으면 그 문서에
    });
    return NextResponse.json({ success: true, data: { relic: pick } });
  } catch (error) {
    console.error("유물 저장 실패:", error);
    return NextResponse.json({ success: false, error: "저장하지 못했습니다." }, { status: 500 });
  }
}
