export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { consumeOne, unitStacksOf } from "@/lib/itemConsume";

// 📌 1회 소모권 1개 사용 — 관리자 유저 조회에서 운영진이 손으로 쓴다(닉네임 변경권 등 효과 없는 소모권).
//    POST { userId, thing } — thing 은 ×N 묶음 키("i:<Item id>" | "s:<상품 id>", 유저 조회 GET 의 stacks[].thing).
//    소모는 lib/itemConsume.js consumeOne — 먼저 끝나는 것 · 먼저 받은 것부터 1개, consumedAt 조건부(두 번 쓰지 않는다).
//    누가 썼는지는 그 구매 건의 consumedBy("admin:<관리자 이름>")에 남는다 — 따로 모아 두는 관리자 작업 기록이 없어서 건 자체에 적는다.
//    응답: { success, data: { id: 쓴 구매 _id, left: 남은 개수, stacks: 이 유저의 묶음 목록(다시 읽은 값) } }
const THING_RE = /^[is]:[0-9a-f]{24}$/i;

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    const b = await request.json().catch(() => ({}));
    const userId = String(b?.userId || "").trim();
    const thing = String(b?.thing || "").trim();
    if (!/^\d{5,25}$/.test(userId) || !THING_RE.test(thing)) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }
    await connectToDatabase();

    const used = await consumeOne({ userId, thing, by: `admin:${auth.name || "admin"}` });
    const stacks = await unitStacksOf(userId);
    if (!used) {
      return NextResponse.json({ success: false, message: "사용할 수 있는 수량이 없습니다.", data: { stacks } }, { status: 409 });
    }
    console.log(`🎟 1회 소모권 사용: ${userId} · ${thing} · ${auth.name || "admin"} · 남은 ${used.left}`);
    return NextResponse.json({ success: true, data: { id: used.id, left: used.left, stacks } });
  } catch (e) {
    console.error("소모권 사용 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
