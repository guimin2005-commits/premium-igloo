export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import UserXp from "@/models/UserXp";
import AfkLog from "@/models/AfkLog";
import BotSetting from "@/models/BotSetting";
import { afkSanctionWaitMin, SANCTIONED_QUERY, SANCTION_STEP_MIN, SANCTION_FLOOR_MIN } from "@/lib/afkCheck";
import { xpStopRecord } from "@/lib/xpStop";

// 📌 관리 › 제재 · 잠수(app/admin/sanctions) — 2026-10-13 운영자 "제재 먹은 유저나 내보내진 유저 볼 수 있게 기록창"
//    GET          → { rule, sanctioned: [제재 중], moved: [잠수 채널로 옮겨진 적 있는 유저] }
//    GET ?userId= → { rule, user: 그 유저 줄(제재 · 이동 — 기록이 없으면 null), logs: [그 유저 이동 기록 최근 50줄] } — 상세 칸
//      · 제재 중 = 봇 잠수 확인과 같은 조건(lib/afkCheck.js SANCTIONED_QUERY) — 음성 XP 정지 · XP 획득 중단(진행 · 예약 · 기간 끝남 · 해제 안 함)
//        중단 상태 판정은 lib/xpStop.js xpStopRecord(유저 조회와 같은 판정)
//      · 이동 = 봇이 잠수 확인에 응답하지 않은 사람을 서버 잠수 채널로 옮긴 것(UserXp.afkMoves · afkSanctionMoves · afkMovedAt, AfkLog)
//    📌 2026-10-17 「이동 기록」 탭을 상세 칸으로 옮겼다 — 전체 최근 300줄 대신 고른 유저의 기록만 읽는다
//    POST { userId, action: "resetAfk" } → 이동 횟수(전체 · 제재 중)를 0 으로. 기록(AfkLog)은 그대로 둔다.
//      봇은 제재 목록을 5분마다 읽으므로 지운 횟수는 늦어도 5분 뒤부터 첫 확인 시간에 반영된다
//    제재 해제는 유저 조회와 같은 API — 음성 XP 정지 ../users/voice-stop · XP 획득 중단 ../users/xp-stop
const SNOWFLAKE = /^\d{5,25}$/;
const USER_FIELDS = {
  userId: 1, displayName: 1, username: 1,
  voiceXpOff: 1, voiceXpOffAt: 1, voiceXpOffBy: 1,
  xpStopFrom: 1, xpStopUntil: 1, xpStopBy: 1, xpStopReason: 1,
  afkMoves: 1, afkSanctionMoves: 1, afkMovedAt: 1,
};
const LOG_LIMIT = 50;
const iso = (d) => (d ? new Date(d).toISOString() : null);
const num = (v) => Math.max(0, Number(v) || 0);
// SANCTIONED_QUERY 와 같은 조건(문서 하나)
const isSanctioned = (u) => u?.voiceXpOff === true || u?.xpStopUntil != null;

async function ruleOf() {
  const s = await BotSetting.findOne({ key: "main" }, { afkCheckSanctionMin: 1, afkCheckOn: 1 }).lean();
  const baseMin = Math.max(1, Number(s?.afkCheckSanctionMin) || 30);
  return { on: s?.afkCheckOn !== false, baseMin, stepMin: SANCTION_STEP_MIN, floorMin: Math.min(baseMin, SANCTION_FLOOR_MIN) };
}

const userRow = (u) => ({
  userId: u.userId,
  displayName: String(u.displayName || u.username || u.userId),
  username: String(u.username || ""),
  afkMoves: num(u.afkMoves),
  afkSanctionMoves: num(u.afkSanctionMoves),
  afkMovedAt: iso(u.afkMovedAt),
  sanctioned: isSanctioned(u),
});
const sanctionRow = (u, baseMin, now) => {
  const stop = xpStopRecord(u, now);
  return {
    ...userRow(u),
    voiceOff: u.voiceXpOff === true ? { at: iso(u.voiceXpOffAt), by: String(u.voiceXpOffBy || "") } : null,
    xpStop: stop ? { from: iso(stop.from), until: iso(stop.until), by: stop.by, reason: stop.reason, status: stop.status } : null,
    nextWaitMin: afkSanctionWaitMin(baseMin, u.afkSanctionMoves),
  };
};

export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    const userId = String(new URL(request.url).searchParams.get("userId") || "").trim();
    if (userId && !SNOWFLAKE.test(userId)) {
      return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
    }
    await connectToDatabase();
    const now = Date.now();

    // 상세 칸 — 한 유저
    if (userId) {
      const [rule, u, logs] = await Promise.all([
        ruleOf(),
        UserXp.findOne({ userId }, USER_FIELDS).lean(),
        AfkLog.find({ userId }).sort({ createdAt: -1 }).limit(LOG_LIMIT).lean(),
      ]);
      return NextResponse.json({
        success: true,
        data: {
          rule,
          user: u ? sanctionRow(u, rule.baseMin, now) : null,
          logs: logs.map((l) => ({
            id: String(l._id),
            channelName: String(l.channelName || ""),
            sanctioned: !!l.sanctioned,
            waitMin: num(l.waitMin),
            moves: num(l.moves),
            sanctionMoves: num(l.sanctionMoves),
            at: iso(l.createdAt),
          })),
        },
      });
    }

    const [rule, sanctionedDocs, movedDocs] = await Promise.all([
      ruleOf(),
      UserXp.find(SANCTIONED_QUERY, USER_FIELDS).lean(),
      UserXp.find({ afkMoves: { $gt: 0 } }, USER_FIELDS).sort({ afkMovedAt: -1 }).limit(300).lean(),
    ]);
    const sanctioned = sanctionedDocs
      .map((u) => sanctionRow(u, rule.baseMin, now))
      .sort((a, b) => b.afkSanctionMoves - a.afkSanctionMoves || String(b.afkMovedAt || "").localeCompare(String(a.afkMovedAt || "")) || a.displayName.localeCompare(b.displayName, "ko"));
    return NextResponse.json({
      success: true,
      data: { rule, sanctioned, moved: movedDocs.map(userRow) },
    });
  } catch (e) {
    console.error("제재 · 잠수 기록 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    const b = await request.json().catch(() => ({}));
    const userId = String(b?.userId || "").trim();
    if (!SNOWFLAKE.test(userId) || b?.action !== "resetAfk") {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }
    await connectToDatabase();
    // 📌 strict:false — 스키마가 캐시된 서버(재시작 전)에서도 새 칸이 조용히 버려지지 않게
    const r = await UserXp.updateOne({ userId }, { $set: { afkMoves: 0, afkSanctionMoves: 0 } }, { strict: false });
    if (!r.matchedCount) return NextResponse.json({ success: false, message: "유저를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ success: true, message: "잠수 채널 이동 횟수를 지웠습니다." });
  } catch (e) {
    console.error("잠수 이동 횟수 지우기 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
