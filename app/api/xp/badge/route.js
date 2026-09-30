export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser, denyIfMaintenance } from "@/lib/apiAuth";
import { getPerks } from "@/lib/itemPerks";
import { fetchMemberRoleInfo } from "@/lib/discordMember";
import { MAX_BADGES, pickBadges } from "@/lib/itemEffects";
import UserXp from "@/models/UserXp";

// 📌 프로필 배지 착용 · 해제 — 인벤토리 상세의 버튼이 부른다.
//    POST { itemId, on }  itemId: 배지 아이템 id, on: true 착용 · false 해제
//    가진 배지만 달 수 있다(보유 판정은 lib/itemPerks getPerks — 인벤토리와 같은 규칙). 최대 MAX_BADGES 개.
//    저장은 UserXp.badgePick 하나 — 안 고른 유저(칸 없음)가 처음 누르면 지금 자동으로 붙은 목록에서 시작한다.
//    반환: { badges } — 지금 단 배지 [{ itemId, name, icon, imageUrl, color, type }] (관리자 순서)
export async function POST(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    const maint = await denyIfMaintenance(auth.session);
    if (maint) return maint;
    if (!auth.userId) return NextResponse.json({ success: false, error: "디스코드 계정을 확인할 수 없습니다." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const itemId = String(body?.itemId ?? "").trim();
    if (!itemId || typeof body?.on !== "boolean") {
      return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
    }
    const on = body.on;

    await connectToDatabase();
    // 📌 디스코드 역할을 확인하지 못하면 저장하지 않는다 — 역할로만 가진 배지(B)가 빠진 목록이 저장되면 확인이 돌아와도 떨어진 채로 남는다
    const { roles } = await fetchMemberRoleInfo(auth.userId).catch(() => ({ roles: null }));
    if (roles === null) {
      return NextResponse.json({ success: false, error: "잠시 후 다시 시도해 주세요." }, { status: 503 });
    }
    const { allBadges } = await getPerks(auth.userId, { heldRoles: roles });
    if (!allBadges.some((b) => b.itemId === itemId)) {
      return NextResponse.json({ success: false, error: "가지고 있지 않은 배지입니다." }, { status: 403 });
    }

    // 📌 읽은 목록이 그대로일 때만 쓴다 — 두 탭에서 동시에 누르면 한쪽 변경이 덮여 사라지므로, 바뀌었으면 다시 읽어 계산한다.
    //    XP 문서가 없는 유저는 쓰기인 여기서 만든다(upsert) — 다른 요청이 먼저 만들었거나 목록이 바뀌었으면 11000 → 다시
    for (let tries = 0; tries < 3; tries++) {
      const doc = await UserXp.findOne({ userId: auth.userId }, { badgePick: 1 }).lean();
      const read = Array.isArray(doc?.badgePick) ? doc.badgePick : null; // null — 안 고름(칸 없음)
      // 지금 단 목록(가진 것만 — 만료 · 환불된 id 는 여기서 빠진 채 저장된다)
      const worn = pickBadges(allBadges, read).map((b) => b.itemId);
      let next = worn;
      if (on && !worn.includes(itemId)) {
        if (worn.length >= MAX_BADGES) {
          return NextResponse.json({ success: false, error: `배지는 ${MAX_BADGES}개까지 달 수 있습니다.` }, { status: 409 });
        }
        next = [...worn, itemId];
      } else if (!on) {
        next = worn.filter((id) => id !== itemId);
      }
      const saved = await UserXp.updateOne({ userId: auth.userId, badgePick: read }, { $set: { badgePick: next } }, { upsert: true }).then(
        () => true,
        (e) => { if (e?.code !== 11000) throw e; return false; }
      );
      if (saved) return NextResponse.json({ success: true, data: { badges: pickBadges(allBadges, next) } });
    }
    return NextResponse.json({ success: false, error: "잠시 후 다시 시도해 주세요." }, { status: 409 });
  } catch (error) {
    console.error("프로필 배지 저장 실패:", error);
    return NextResponse.json({ success: false, error: "저장하지 못했습니다." }, { status: 500 });
  }
}
