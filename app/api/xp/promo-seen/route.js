export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser, denyIfMaintenance } from "@/lib/apiAuth";
import { VOICE_TIERS, getTierIndex } from "@/lib/voiceTiers";
import UserXp from "@/models/UserXp";

// 📌 승급 화면을 봤다 — LEVEL 의 승급 화면(app/level/PromoOverlay)을 닫을 때, 또는 처음 들어와 지금 등급을 조용히 적을 때 부른다.
//    POST { tier }  tier: 등급 인덱스(lib/voiceTiers). 마지막으로 본 등급을 그대로 적는다 — 등급이 내려가면 화면이 내린 값을 보내고,
//    다시 올라가면 승급 화면이 또 뜬다. 지금 등급보다 높게는 적지 않는다. XP 문서가 없는 사람은 적을 것이 없어 만들지 않는다(조회 화면에서 부르는 쓰기라서)
export async function POST(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    const maint = await denyIfMaintenance(auth.session);
    if (maint) return maint;
    if (!auth.userId) return NextResponse.json({ success: false, error: "디스코드 계정을 확인할 수 없습니다." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const tier = Number(body?.tier);
    if (!Number.isInteger(tier) || tier < 0 || tier >= VOICE_TIERS.length) {
      return NextResponse.json({ success: false, error: "알 수 없는 등급입니다." }, { status: 400 });
    }

    await connectToDatabase();
    const doc = await UserXp.findOne({ userId: auth.userId }, { level: 1, promoSeen: 1 }).lean();
    if (!doc) return NextResponse.json({ success: true, data: { promoSeen: null } });
    const t = Math.min(tier, getTierIndex(doc.level || 0));
    await UserXp.updateOne({ userId: auth.userId }, { $set: { promoSeen: t } });
    return NextResponse.json({ success: true, data: { promoSeen: t } });
  } catch (error) {
    console.error("승급 화면 기록 실패:", error);
    return NextResponse.json({ success: false, error: "저장하지 못했습니다." }, { status: 500 });
  }
}
