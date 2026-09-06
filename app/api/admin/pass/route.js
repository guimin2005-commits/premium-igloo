export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { normalizeTiers, DEFAULT_UNLOCK_PRICE } from "@/lib/seasonPass";
import SeasonPass from "@/models/SeasonPass";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};

// 저장한 문서를 화면이 그대로 다시 그릴 수 있는 모양으로 (계약: { enabled, unlockPrice, tiers })
// 각 티어에는 tid 가 실려 나간다 — 화면은 편집·정렬·삭제 뒤에도 이 값을 그대로 되돌려 보내야 한다
const toConfig = (doc) => ({
  enabled: !!doc?.enabled,
  unlockPrice: doc?.unlockPrice == null ? DEFAULT_UNLOCK_PRICE : doc.unlockPrice,
  tiers: normalizeTiers(doc?.tiers, doc?.nextTid).tiers,
  updatedAt: doc?.updatedAt ?? null,
});

// ── [조회] 시즌 패스 설정 — 관리자 전용 ──
export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    // 없으면 스키마 기본값으로 만들어 준다 (BotSetting 과 같은 방식)
    const doc = await SeasonPass.findOneAndUpdate(
      { key: "main" },
      { $setOnInsert: { key: "main" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return NextResponse.json({ success: true, config: toConfig(doc) });
  } catch (e) {
    console.error("시즌 패스 설정 조회 오류:", e);
    return NextResponse.json({ success: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [저장] 시즌 패스 설정 — 관리자 전용 ──
//    티어 정렬·level 재부여·음수 방어는 전부 서버가 한다. 화면이 보낸 순서는 믿지 않는다.
export async function PUT(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));

    // 지금 저장된 문서를 먼저 확보한다 — tid 를 이어서 발급하려면 nextTid 가 필요하다
    const cur = await SeasonPass.findOneAndUpdate(
      { key: "main" },
      { $setOnInsert: { key: "main" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // 📌 온 필드만 덮어쓴다 — body 를 통째로 치환하면 tiers 가 빠졌을 때 등록된 티어가 전멸하고,
    //    enabled 가 빠졌을 때 패스가 통째로 꺼진다. 백업이 없어 되돌릴 방법이 없다.
    const $set = { updatedAt: new Date() };
    if (Array.isArray(b?.tiers)) {
      const n = normalizeTiers(b.tiers, cur?.nextTid);
      $set.tiers = n.tiers;
      // 발급된 번호를 함께 저장해야 다음 저장 때 같은 tid 를 다시 내주지 않는다
      $set.nextTid = n.nextTid;
    }
    if (b?.enabled !== undefined) $set.enabled = !!b.enabled;
    if (b?.unlockPrice !== undefined) $set.unlockPrice = Math.max(0, Math.floor(Number(b.unlockPrice) || 0));

    const doc = await SeasonPass.findOneAndUpdate({ key: "main" }, { $set }, { new: true }).lean();

    return NextResponse.json({ success: true, config: toConfig(doc) });
  } catch (e) {
    console.error("시즌 패스 설정 저장 오류:", e);
    return NextResponse.json({ success: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
