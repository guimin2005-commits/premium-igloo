export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import XpLog from "@/models/XpLog";
import UserXp from "@/models/UserXp";
import BotSetting from "@/models/BotSetting";
import { kstDaysStart } from "@/lib/kst";
import {
  ACTIVITY_PERIODS,
  ACTIVITY_SORTS,
  ACTIVITY_LIMIT,
  voicePipeline,
  dailyPipeline,
  mergeActivity,
  sortActivity,
} from "@/lib/adminActivity";

// 📌 관리자 이상 활동 — 잠수로 음성 XP 를 쌓는 유저를 가려 보는 읽기 전용 목록 (화면: app/admin/activity)
//    GET ?period=today|7d|30d&sort=score|voice|dayMax|streak|alone|muted|deaf|idle|live|chat|xp
//      → { period, since, approx, rows: [상위 100명], total }
//    approx: 기간 안에 ctx 없는 예전 음성 줄이 섞였다(혼자 · 음소거 근사치). 줄의 voiceOff: 음성 XP 정지 중(app/api/admin/users/voice-stop)
//    셈의 정의는 lib/adminActivity.js. 큰 집계는 XpLog $group · $setWindowFields 로 서버(DB)에서 끝낸다.
//    📌 기간마다 전체 결과를 60초 동안 들고 있는다 — 정렬만 바꾸면 다시 세지 않는다
const CACHE_MS = 60_000;
const cache = new Map(); // period → { at, data }

async function compute(period) {
  const since = kstDaysStart(ACTIVITY_PERIODS[period]);
  // 📌 주기는 설정이 아니라 로그마다(sec) 센다 — 주기를 바꿔도 지난 기록이 다시 묶이지 않게(lib/adminActivity.js)
  const s = await BotSetting.findOne({ key: "main" }, { voiceXp: 1 }).lean();
  const baseXp = Math.max(0, Math.floor(Number(s?.voiceXp) || 0));

  const [voiceRows, dailyRows] = await Promise.all([
    XpLog.aggregate(voicePipeline({ since, baseXp })).allowDiskUse(true),
    XpLog.aggregate(dailyPipeline({ since })).allowDiskUse(true),
  ]);
  const ids = [...new Set([...voiceRows, ...dailyRows].map((r) => r._id).filter(Boolean))];
  const users = ids.length ? await UserXp.find({ userId: { $in: ids } }, { userId: 1, displayName: 1, username: 1 }).lean() : [];
  const names = new Map(users.map((u) => [u.userId, u]));

  const rows = mergeActivity(voiceRows, dailyRows, names);
  return {
    period,
    since: since.toISOString(),
    rows,
    approx: rows.some((r) => r.approx),
  };
}

export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;

    const { searchParams } = new URL(request.url);
    const p = searchParams.get("period");
    const period = Object.hasOwn(ACTIVITY_PERIODS, p) ? p : "7d";
    const sq = searchParams.get("sort");
    const sort = ACTIVITY_SORTS.includes(sq) ? sq : "score";

    await connectToDatabase();
    let hit = cache.get(period);
    if (!hit || Date.now() - hit.at > CACHE_MS) {
      hit = { at: Date.now(), data: await compute(period) };
      cache.set(period, hit);
    }
    const { rows, ...rest } = hit.data;
    // 📌 정지 칩은 캐시 밖에서 매번 — 유저 조회에서 정지 · 해제한 것이 바로 보이게.
    //    집계로 찾는다(find 조건은 strictQuery 설정에 따라 스키마에 없는 칸이 지워져 전원이 잡힐 수 있다)
    const off = new Set((await UserXp.aggregate([{ $match: { voiceXpOff: true } }, { $project: { _id: 0, userId: 1 } }])).map((u) => u.userId));
    const top = sortActivity(rows, sort).slice(0, ACTIVITY_LIMIT).map((r) => ({ ...r, voiceOff: off.has(r.userId) }));

    return NextResponse.json({
      success: true,
      data: { ...rest, sort, total: rows.length, rows: top },
    });
  } catch (e) {
    console.error("이상 활동 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
