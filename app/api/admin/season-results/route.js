export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import SeasonResult from "@/models/SeasonResult";
import BotSetting from "@/models/BotSetting";

// 📌 시즌 결산 기록 — 봇(seasonSettle)이 시즌이 끝나면 상위 3인을 굳혀 둔다. 여기서는 조회와 RANKER 역할 지급 요청만.
//    디스코드 역할은 봇만 만질 수 있으므로 지급은 봇이 roleGrantRequested 를 보고 한다(성공하면 roleGrantedAt).

const fail = (message, status) => NextResponse.json({ success: false, message, error: message }, { status });

// ── [조회] 최신 시즌 먼저 ──
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const rows = await SeasonResult.find().sort({ season: -1 }).limit(50).lean();
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    console.error("시즌 결과 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [RANKER 역할 지급 요청] { season } ──
export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();

    const b = await request.json().catch(() => ({}));
    const season = Math.trunc(Number(b?.season));
    if (!Number.isFinite(season) || season < 1) return fail("시즌을 선택해 주세요.", 400);

    const doc = await SeasonResult.findOne({ season }).lean();
    if (!doc) return fail("결산 기록이 없습니다.", 404);
    if (doc.roleGrantedAt) return fail("이미 지급했습니다.", 409);
    if (!Array.isArray(doc.top) || doc.top.length === 0) return fail("지급할 상위 기록이 없습니다.", 400);

    // 📌 지금 설정된 RANKER 역할을 쓴다 — 결산 때 역할을 비워 뒀다가 나중에 고른 경우도 여기서 채워진다
    const setting = await BotSetting.findOne({ key: "main" }, { rankerRoleId: 1 }).lean();
    const roleId = String(setting?.rankerRoleId || doc.rankerRoleId || "").trim();
    if (!roleId) return fail("RANKER 역할을 먼저 선택해 주세요.", 400);

    // 📌 조건부 선점 — 지급 전이고, 봇 대기열에 없거나 지난 시도가 실패(error)한 것만 세운다.
    //    봇(seasonSettle)은 error 가 비었고 roleGrantRequested 이거나 결산 때 rankerRoleId 가 정해진 결과를 집는다 — 그 조건의 반대.
    //    두 번 눌러도 한 번만 서고, 봇이 처리 중인 결과의 역할을 도중에 바꾸지 않는다.
    const updated = await SeasonResult.findOneAndUpdate(
      {
        season,
        roleGrantedAt: null,
        $or: [
          { error: { $nin: ["", null] } },
          { roleGrantRequested: { $ne: true }, rankerRoleId: { $in: ["", null] } },
        ],
      },
      { $set: { roleGrantRequested: true, rankerRoleId: roleId, error: "" } },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      // 그 사이 다른 요청이 먼저 세웠거나 봇이 지급을 끝냈다
      const now = await SeasonResult.findOne({ season }).lean();
      if (now?.roleGrantedAt) return fail("이미 지급했습니다.", 409);
      return NextResponse.json({ success: true, message: "이미 지급 대기 중입니다.", data: now });
    }
    return NextResponse.json({ success: true, message: "RANKER 역할 지급을 요청했습니다. 봇이 곧 처리합니다.", data: updated });
  } catch (e) {
    console.error("RANKER 역할 지급 요청 오류:", e);
    return fail("요청 중 오류가 발생했습니다.", 500);
  }
}
