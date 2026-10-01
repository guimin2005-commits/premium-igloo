export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { normalizeTiers, DEFAULT_UNLOCK_PRICE, MAX_REWARD_DAYS } from "@/lib/seasonPass";
import SeasonPass from "@/models/SeasonPass";

// 저장한 문서를 화면이 그대로 다시 그릴 수 있는 모양으로 (계약: { enabled, unlockPrice, tiers })
// 각 티어에는 tid 가 실려 나간다 — 화면은 편집·정렬·삭제 뒤에도 이 값을 그대로 되돌려 보내야 한다
// 티어의 free · paid 는 보상 목록(최대 4개)이다. 옛 문서(칸마다 객체 하나)도 normalizeTiers 가 목록으로 읽어 준다.
// unlockPrice 는 XP 단위 그대로 주고받는다 — 화면이 빙옥으로 받아 ×10,000 해서 보낸다(lib/pointRate.js)
const toConfig = (doc) => ({
  enabled: !!doc?.enabled,
  unlockPrice: doc?.unlockPrice == null ? DEFAULT_UNLOCK_PRICE : doc.unlockPrice,
  tiers: normalizeTiers(doc?.tiers, doc?.nextTid).tiers,
  updatedAt: doc?.updatedAt ?? null,
});

// ── [조회] 시즌 패스 설정 — 관리자 전용 ──
export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
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
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
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
      // 칸마다 빈 보상은 빼고 최대 4개까지만 남는다 (normalizeTiers → rewardsOf)
      // 📌 아이템 기간(days) — 0 = 무기한, 아이템이 아닌 보상은 늘 0. 소수 · 음수는 normalizeTiers 가 0 이상 정수로 고치고,
      //    상한(MAX_REWARD_DAYS)을 넘는 값은 조용히 깎지 않고 돌려보낸다(화면도 저장 전에 먼저 막는다)
      if (b.tiers.some((t) => [t?.free, t?.paid].flat().some((r) => r?.kind === "item" && Number(r?.days) > MAX_REWARD_DAYS))) {
        return NextResponse.json({ success: false, message: `아이템 기간은 ${MAX_REWARD_DAYS.toLocaleString()}일 이하로 입력해 주세요.` }, { status: 400 });
      }
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
