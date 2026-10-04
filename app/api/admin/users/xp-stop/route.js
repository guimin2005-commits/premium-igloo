export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { xpStopState } from "@/lib/xpStop";
import UserXp from "@/models/UserXp";

// 📌 XP 획득 중단 — 관리 › 유저 조회 상세 칸 [XP 중단] 창 (관리자 전용 — getServerSession + isAdminName, lib/apiAuth requireAdmin)
//    2026-10-04 운영자 "회수 + 타임아웃 3일 + 그 뒤 5일 전체 XP 획득 중단" — 시작(지금 · 지정 시각)과 기간(일)로 세운다.
//    POST { userId, on: true, from: "now" | ISO 시각, days: 1~3650, reason? } → UserXp.xpStopFrom · xpStopUntil · xpStopBy · xpStopReason (있던 중단은 덮어쓴다)
//    POST { userId, on: false } → 해제(네 칸을 비운다)
//    끝 시각이 지나면 저절로 풀린다. 막는 범위는 lib/xpStop.js · bot/src/xpStop.js 머리 주석
//    응답: { success, message, data: { from, until, by, reason, active } | null }
const SNOWFLAKE = /^\d{5,25}$/;
const DAY_MS = 86400000;
const MAX_DAYS = 3650; // 관리 › 아이템 지급 기간 칸과 같은 끝

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    const b = await request.json().catch(() => ({}));
    const userId = String(b?.userId || "").trim();
    if (!SNOWFLAKE.test(userId) || typeof b?.on !== "boolean") {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    let set;
    if (b.on) {
      const now = Date.now();
      const from = b.from === "now" ? now : new Date(String(b.from || "")).getTime();
      if (!Number.isFinite(from)) {
        return NextResponse.json({ success: false, message: "시작 시각을 확인해 주세요." }, { status: 400 });
      }
      const days = Number(b.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        return NextResponse.json({ success: false, message: "기간을 확인해 주세요." }, { status: 400 });
      }
      const until = from + days * DAY_MS;
      if (until <= now) {
        return NextResponse.json({ success: false, message: "이미 지난 기간입니다." }, { status: 400 });
      }
      set = {
        xpStopFrom: new Date(from),
        xpStopUntil: new Date(until),
        xpStopBy: auth.name || "admin",
        xpStopReason: String(b?.reason || "").trim().slice(0, 100),
      };
    } else {
      set = { xpStopFrom: null, xpStopUntil: null, xpStopBy: "", xpStopReason: "" };
    }

    await connectToDatabase();
    // 📌 strict:false — 스키마가 캐시된 서버(재시작 전)에서도 새 칸이 조용히 버려지지 않게(음성 XP 정지와 같다)
    const doc = await UserXp.findOneAndUpdate(
      { userId },
      { $set: set },
      { new: true, strict: false, projection: { xpStopFrom: 1, xpStopUntil: 1, xpStopBy: 1, xpStopReason: 1 } }
    ).lean();
    if (!doc) {
      return NextResponse.json({ success: false, message: "XP 기록이 없는 유저입니다." }, { status: 404 });
    }
    const state = xpStopState(doc);
    console.log(
      `⛔ XP 획득 중단 ${b.on ? `설정 ${set.xpStopFrom.toISOString()} ~ ${set.xpStopUntil.toISOString()}` : "해제"}: ${userId} · ${auth.name || "admin"}`
    );
    return NextResponse.json({
      success: true,
      message: b.on ? "XP 획득 중단을 설정했습니다." : "XP 획득 중단을 해제했습니다.",
      data: state,
    });
  } catch (e) {
    console.error("XP 획득 중단 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
