export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { planLegacyCodes, LEGACY_PAYOUT_PREFIX } from "@/lib/couponLegacy";
import Code from "@/models/Code";
import Coupon from "@/models/Coupon";
import CodeGrant from "@/models/CodeGrant";
import Payout from "@/models/Payout";
import UserXp from "@/models/UserXp";

// ── [이전] 기존 '코드'를 보상형 쿠폰으로 옮긴다 (관리자) ──
//    같은 code가 이미 쿠폰에 있으면 새로 만들지 않으므로 여러 번 눌러도 안전하다.
//    📌 2026-10-04 — 예전에 쓴 사람의 사용 기록도 넘긴다(lib/couponLegacy.js planLegacyCodes). 이미 옮긴 쿠폰에는 빠진 사람만 덧붙인다.
//    GET 은 남은 일(옮길 코드 · 넘길 사람 수)만 센다 — 쿠폰 관리 화면이 남은 일이 있을 때만 '예전 코드 가져오기' 버튼을 보인다(다 옮겼으면 없음)

// 이전 재료 — 예전 코드 · 같은 코드의 쿠폰 · 예전 사용 기록(XP 지급 · 역할 지급 대기열) · 이름이 맞는 XP 기록
async function loadPlan() {
  const codes = await Code.find().lean();
  if (codes.length === 0) return planLegacyCodes({ codes });
  const list = codes.map((c) => c.code);
  const names = [...new Set(codes.flatMap((c) => (Array.isArray(c.usedBy) ? c.usedBy : [])).filter(Boolean).map(String))];
  const [coupons, payouts, grants, users] = await Promise.all([
    Coupon.find({ code: { $in: list } }, { code: 1, kind: 1, usedBy: 1 }).lean(),
    Payout.find({ source: "code", reason: { $in: list.map((c) => `${LEGACY_PAYOUT_PREFIX}${c}`) } }, { userId: 1, userName: 1, reason: 1 }).lean(),
    CodeGrant.find({ code: { $in: list } }, { userId: 1, userName: 1, code: 1 }).lean(),
    names.length ? UserXp.find({ $or: [{ username: { $in: names } }, { displayName: { $in: names } }] }, { userId: 1, username: 1, displayName: 1 }).lean() : [],
  ]);
  return planLegacyCodes({ codes, coupons, payouts, grants, users });
}

export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const plan = await loadPlan();
    return NextResponse.json({ success: true, data: { pending: plan.moved, linked: plan.linked, unmatched: plan.unmatched } });
  } catch (e) {
    console.error("쿠폰 이전 확인 오류:", e);
    return NextResponse.json({ success: false, message: "확인 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;

    await connectToDatabase();
    const plan = await loadPlan();
    if (plan.moved === 0 && plan.linked === 0) {
      return NextResponse.json({ success: true, message: "옮길 코드가 없습니다.", data: { moved: 0, skipped: plan.skipped, linked: 0, unmatched: plan.unmatched } });
    }

    if (plan.create.length > 0) await Coupon.insertMany(plan.create, { ordered: false });
    // 이미 옮긴 쿠폰 — 빠진 사람만 덧붙인다($addToSet: 이미 있는 사람은 그대로). 사용 횟수(usedCount)는 예전 기록에 이미 들어 있어 건드리지 않는다
    for (const l of plan.link) {
      await Coupon.updateOne({ _id: l.couponId, kind: "reward" }, { $addToSet: { usedBy: { $each: l.add } } });
    }

    return NextResponse.json({
      success: true,
      message: [
        plan.moved ? `${plan.moved}개를 쿠폰으로 옮겼습니다.` : "",
        plan.linked ? `사용 기록 ${plan.linked}건을 이어받았습니다.` : "",
        plan.unmatched ? `(찾지 못한 이름 ${plan.unmatched}개)` : "",
      ].filter(Boolean).join(" "),
      data: { moved: plan.moved, skipped: plan.skipped, linked: plan.linked, unmatched: plan.unmatched },
    });
  } catch (e) {
    console.error("쿠폰 이전 오류:", e);
    return NextResponse.json({ success: false, message: "이전 중 오류가 발생했습니다." }, { status: 500 });
  }
}
