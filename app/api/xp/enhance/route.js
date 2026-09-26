export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getLevelByXp } from "@/lib/leveling";
import { buildEnhanceView, enhancePolicy, enhanceCost, ENHANCE_LABEL } from "@/lib/enhance";
import { xpToPoint } from "@/lib/pointRate";
import BotSetting from "@/models/BotSetting";
import UserXp from "@/models/UserXp";

const USER_FIELDS = { xp: 1, point: 1, level: 1, chatEnhance: 1, voiceEnhance: 1 };

const loadState = async (userId) => {
  const [setting, doc] = await Promise.all([
    BotSetting.findOne({ key: "main" }).lean(),
    UserXp.findOne({ userId }, USER_FIELDS).lean(),
  ]);
  return { setting, doc };
};
const balanceOf = (doc) => ({ xp: doc?.xp ?? 0, point: doc?.point ?? 0 });
const levelOf = (doc, field) => Math.max(0, Math.floor(Number(doc?.[field]) || 0));

// ── [조회] 내 강화 단계 · 다음 효과 · 다음 비용 · 잔액 ──
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }
    await connectToDatabase();
    const { setting, doc } = await loadState(session.user.id);
    return NextResponse.json({
      success: true,
      data: { ...buildEnhanceView(setting, doc), balance: balanceOf(doc) },
    });
  } catch (e) {
    console.error("강화 조회 오류:", e);
    return NextResponse.json({ success: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [강화] body { kind: "chat" | "voice", payMethod: "xp" | "point" } ──
//    실패 없음 · 단계마다 비용 상승 · 영구. 비용은 서버가 정책으로 다시 계산한다 (클라이언트 값은 보지 않는다).
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const kind = body?.kind === "voice" ? "voice" : body?.kind === "chat" ? "chat" : "";
    const payMethod = body?.payMethod === "point" ? "point" : body?.payMethod === "xp" ? "xp" : "";
    if (!kind || !payMethod) {
      return NextResponse.json({ success: false, message: "강화 종류와 결제 수단을 골라 주세요." }, { status: 400 });
    }

    await connectToDatabase();
    const userId = session.user.id;
    const { setting, doc } = await loadState(userId);
    const p = enhancePolicy(setting);

    const levelField = `${kind}Enhance`;
    const cur = levelOf(doc, levelField);
    const max = kind === "chat" ? p.chatEnhanceMax : p.voiceEnhanceMax;
    if (cur >= max) {
      return NextResponse.json(
        { success: false, message: "최대 단계입니다", view: buildEnhanceView(setting, doc), balance: balanceOf(doc) },
        { status: 400 }
      );
    }

    const cost = kind === "chat"
      ? enhanceCost(p.chatEnhanceBaseCost, p.chatEnhanceCostGrowthPct, cur + 1)
      : enhanceCost(p.voiceEnhanceBaseCost, p.voiceEnhanceCostGrowthPct, cur + 1);
    // 📌 관리자도 일반 유저와 똑같이 차감한다 — 테스트로 올린 단계는 관리자 초기화로 되돌린다
    //    비용은 XP 로만 정한다. 빙옥으로 내면 환율(1 빙옥 = 1,000 XP · 올림 — lib/pointRate.js)을 적용한 값을 뺀다
    const field = payMethod === "point" ? "point" : "xp";
    const charged = field === "point" ? xpToPoint(cost) : cost;
    const shortMsg = payMethod === "point" ? "보유 빙옥이 부족합니다." : "보유 XP가 부족합니다.";

    // 문서가 없는 유저(디스코드에서 XP 를 한 번도 못 받음)는 잔액 0 — 비용이 있으면 바로 거절
    if (!doc && charged > 0) {
      return NextResponse.json({ success: false, message: shortMsg }, { status: 400 });
    }

    // 원자 갱신 한 번 — 단계 가드(cur) + 잔액 가드($gte). 연타·동시 요청은 하나만 통과한다.
    //    기존 문서에는 강화 필드 자체가 없을 수 있으니 0 단계는 null(필드 없음)도 함께 받는다
    //    ({ field: 0 } 은 필드 없는 문서와 매치되지 않는다).
    //    XP 는 시즌 패스 진행도(xp - passBaseXp)의 원천이라 기준선도 같은 폭으로 내린다 (checkout 과 동일).
    const inc = { [field]: -charged, [levelField]: 1 };
    if (field === "xp") inc.passBaseXp = -charged;
    // 누적도 실제로 뺀 값(그 화폐 단위)으로 쌓는다 — 관리자 초기화가 이 값을 그대로 돌려준다
    if (charged > 0) inc[`enhancePaid.${field}`] = charged;
    const filter = { userId, [levelField]: cur === 0 ? { $in: [0, null] } : cur };
    if (charged > 0) filter[field] = { $gte: charged };

    let updated = null;
    try {
      updated = await UserXp.findOneAndUpdate(
        filter,
        { $inc: inc, $set: { updatedAt: new Date() } },
        { new: true, projection: USER_FIELDS, ...(doc ? {} : { upsert: true, setDefaultsOnInsert: true }) }
      ).lean();
    } catch (e) {
      if (e?.code !== 11000) throw e; // upsert 경합 — 아래에서 다시 읽어 판정한다
    }

    if (!updated) {
      const now = await UserXp.findOne({ userId }, USER_FIELDS).lean();
      const view = buildEnhanceView(setting, now);
      if (levelOf(now, levelField) !== cur) {
        return NextResponse.json(
          { success: false, message: "단계가 바뀌었습니다. 다시 확인해 주세요.", view, balance: balanceOf(now) },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: false, message: shortMsg, view, balance: balanceOf(now) }, { status: 400 });
    }

    // XP 결제면 레벨이 내려갔을 수 있다 — 다시 계산하고 봇이 보상 역할을 다시 맞추도록 표시 (checkout 과 동일)
    if (field === "xp" && charged > 0) {
      const newLevel = getLevelByXp(updated.xp ?? 0);
      await UserXp.updateOne({ userId }, { $set: { level: newLevel, needsRoleSync: true } });
      updated.level = newLevel;
    }

    const view = buildEnhanceView(setting, updated);
    return NextResponse.json({
      success: true,
      message: `${ENHANCE_LABEL[kind]} 강화 ${view[kind].level}단계`,
      kind,
      payMethod,
      charged, // 실제로 뺀 값 (payMethod 단위 — 빙옥이면 빙옥)
      view,
      balance: balanceOf(updated),
    });
  } catch (e) {
    console.error("강화 오류:", e);
    return NextResponse.json({ success: false, message: "강화 중 오류가 발생했습니다." }, { status: 500 });
  }
}
