export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import UserXp from "@/models/UserXp";
import AfkLog from "@/models/AfkLog";
import BotSetting from "@/models/BotSetting";
import { afkSanctionWaitMin, SANCTIONED_QUERY, SANCTION_STEP_MIN, SANCTION_FLOOR_MIN } from "@/lib/afkCheck";

// 📌 관리 › 제재 · 잠수 기록(app/admin/sanctions) — 2026-10-13 운영자 "제재 먹은 유저나 내보내진 유저 볼 수 있게 기록창"
//    GET → { rule, sanctioned: [제재 중], moved: [잠수 채널로 옮겨진 적 있는 유저], logs: [이동 기록 최근 300줄] }
//      · 제재 중 = 봇 잠수 확인과 같은 조건(lib/afkCheck.js SANCTIONED_QUERY) — 음성 XP 정지 · XP 획득 중단(진행 · 예약 · 기간 끝남 · 해제 안 함)
//      · 이동 = 봇이 잠수 확인에 응답하지 않은 사람을 서버 잠수 채널로 옮긴 것(UserXp.afkMoves · afkSanctionMoves · afkMovedAt, AfkLog)
//    POST { userId, action: "resetAfk" } → 이동 횟수(전체 · 제재 중)를 0 으로. 기록(AfkLog)은 그대로 둔다.
//      봇은 제재 목록을 5분마다 읽으므로 지운 횟수는 늦어도 5분 뒤부터 첫 확인 시간에 반영된다
const SNOWFLAKE = /^\d{5,25}$/;
const USER_FIELDS = {
  userId: 1, displayName: 1, username: 1,
  voiceXpOff: 1, voiceXpOffAt: 1, voiceXpOffBy: 1,
  xpStopFrom: 1, xpStopUntil: 1, xpStopBy: 1, xpStopReason: 1,
  afkMoves: 1, afkSanctionMoves: 1, afkMovedAt: 1,
};
const iso = (d) => (d ? new Date(d).toISOString() : null);
const num = (v) => Math.max(0, Number(v) || 0);

function xpStopOf(u, now) {
  if (!u?.xpStopUntil) return null;
  const from = u.xpStopFrom ? new Date(u.xpStopFrom).getTime() : NaN;
  const until = new Date(u.xpStopUntil).getTime();
  const status = until <= now ? "ended" : Number.isFinite(from) && from > now ? "reserved" : "active";
  return { from: iso(u.xpStopFrom), until: iso(u.xpStopUntil), by: String(u.xpStopBy || ""), reason: String(u.xpStopReason || ""), status };
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const now = Date.now();
    const [s, sanctionedDocs, movedDocs, logs] = await Promise.all([
      BotSetting.findOne({ key: "main" }, { afkCheckSanctionMin: 1, afkCheckFirstMin: 1, afkCheckReplyMin: 1, afkCheckOn: 1 }).lean(),
      UserXp.find(SANCTIONED_QUERY, USER_FIELDS).lean(),
      UserXp.find({ afkMoves: { $gt: 0 } }, USER_FIELDS).sort({ afkMovedAt: -1 }).limit(300).lean(),
      AfkLog.find({}).sort({ createdAt: -1 }).limit(300).lean(),
    ]);
    const baseMin = Math.max(1, Number(s?.afkCheckSanctionMin) || 30);
    const firstMin = Math.max(1, Number(s?.afkCheckFirstMin) || 60);
    const sanctionedIds = new Set(sanctionedDocs.map((u) => u.userId));
    const userRow = (u) => ({
      userId: u.userId,
      displayName: String(u.displayName || u.username || u.userId),
      username: String(u.username || ""),
      afkMoves: num(u.afkMoves),
      afkSanctionMoves: num(u.afkSanctionMoves),
      afkMovedAt: iso(u.afkMovedAt),
      sanctioned: sanctionedIds.has(u.userId),
    });
    const sanctioned = sanctionedDocs
      .map((u) => ({
        ...userRow(u),
        voiceOff: u.voiceXpOff ? { at: iso(u.voiceXpOffAt), by: String(u.voiceXpOffBy || "") } : null,
        xpStop: xpStopOf(u, now),
        nextWaitMin: afkSanctionWaitMin(baseMin, u.afkSanctionMoves),
      }))
      .sort((a, b) => b.afkSanctionMoves - a.afkSanctionMoves || String(b.afkMovedAt || "").localeCompare(String(a.afkMovedAt || "")) || a.displayName.localeCompare(b.displayName, "ko"));
    return NextResponse.json({
      success: true,
      data: {
        rule: { on: s?.afkCheckOn !== false, baseMin, firstMin, replyMin: Math.max(1, Number(s?.afkCheckReplyMin) || 5), stepMin: SANCTION_STEP_MIN, floorMin: Math.min(baseMin, SANCTION_FLOOR_MIN) },
        sanctioned,
        moved: movedDocs.map(userRow),
        logs: logs.map((l) => ({
          id: String(l._id),
          userId: l.userId,
          displayName: String(l.displayName || l.userId),
          channelName: String(l.channelName || ""),
          sanctioned: !!l.sanctioned,
          waitMin: num(l.waitMin),
          moves: num(l.moves),
          sanctionMoves: num(l.sanctionMoves),
          nextWaitMin: num(l.nextWaitMin),
          at: iso(l.createdAt),
        })),
      },
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
