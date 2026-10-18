export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { denyIfMaintenance } from "@/lib/apiAuth";
import InvFavorite from "@/models/InvFavorite";

// 📌 인벤토리 즐겨찾기(2026-10-17) — 계정마다 uid 목록 하나(models/InvFavorite.js). 인벤토리(app/components/Inventory)가 부른다.
//    GET                       → { uids }  (없으면 [])
//    POST { uid, on: boolean } → { uids }  on = 넣기($addToSet) · off = 빼기($pull). 최대 MAX_FAV 개
//    uid 는 인벤토리 API 가 주는 그대로 — 가졌는지는 보지 않는다(없는 칸의 uid 는 화면이 지금 칸과 맞춰 걸러 낸다).
//    관리자 체험 칸("trial:…")은 넣지 않는다
const MAX_FAV = 500;
const UID_RE = /^[a-z][a-z-]*:[A-Za-z0-9:_-]+$/;

const fail = (error, status) => NextResponse.json({ success: false, error }, { status });
const ok = (uids) => NextResponse.json({ success: true, data: { uids: Array.isArray(uids) ? uids : [] } });

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return fail("로그인이 필요합니다.", 401);

    await connectToDatabase();
    const doc = await InvFavorite.findOne({ userId: session.user.id }, { uids: 1 }).lean();
    return ok(doc?.uids);
  } catch (e) {
    console.error("즐겨찾기 조회 오류:", e);
    return fail("조회 중 오류가 발생했습니다.", 500);
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return fail("로그인이 필요합니다.", 401);
    const maint = await denyIfMaintenance(session);
    if (maint) return maint;

    const body = await request.json().catch(() => ({}));
    const uid = body?.uid;
    const on = body?.on;
    if (typeof uid !== "string" || uid.length < 1 || uid.length > 120 || !UID_RE.test(uid) || typeof on !== "boolean") {
      return fail("잘못된 요청입니다.", 400);
    }
    if (uid.startsWith("trial:")) return fail("체험 아이템은 즐겨찾기할 수 없습니다.", 400);

    await connectToDatabase();
    const userId = session.user.id;

    // 빼기 — 문서가 없으면 뺄 것도 없다(만들지 않는다)
    if (!on) {
      const doc = await InvFavorite.findOneAndUpdate(
        { userId },
        { $pull: { uids: uid }, $set: { updatedAt: new Date() } },
        { returnDocument: "after" }
      ).lean();
      return ok(doc?.uids);
    }

    // 📌 넣기 — 이미 들어 있거나 MAX_FAV 개 미만일 때만 맞는다(한 번에 판정 — 연타 · 두 탭이 동시에 넣어도 500 을 넘지 않는다).
    //    꽉 찬 문서는 조건에 안 걸려 upsert 가 새 문서를 만들려다 userId 유일 인덱스에 막힌다 → 11000 → 다시 읽어 가른다.
    //    처음 넣는 두 요청이 겹쳐도 진 쪽이 11000 → 다시 시도하면 있는 문서에 붙는다
    for (let tries = 0; tries < 3; tries++) {
      try {
        const doc = await InvFavorite.findOneAndUpdate(
          { userId, $or: [{ uids: uid }, { [`uids.${MAX_FAV - 1}`]: { $exists: false } }] },
          { $addToSet: { uids: uid }, $set: { updatedAt: new Date() } },
          { upsert: true, returnDocument: "after" }
        ).lean();
        return ok(doc?.uids);
      } catch (e) {
        if (e?.code !== 11000) throw e;
        const cur = await InvFavorite.findOne({ userId }, { uids: 1 }).lean();
        const list = Array.isArray(cur?.uids) ? cur.uids : [];
        if (list.includes(uid)) return ok(list);
        if (list.length >= MAX_FAV) return fail(`즐겨찾기는 ${MAX_FAV}개까지 넣을 수 있습니다.`, 400);
      }
    }
    return fail("잠시 후 다시 시도해 주세요.", 409);
  } catch (e) {
    console.error("즐겨찾기 저장 오류:", e);
    return fail("저장 중 오류가 발생했습니다.", 500);
  }
}
