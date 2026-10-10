export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser, denyIfMaintenance } from "@/lib/apiAuth";
import { getPerks } from "@/lib/itemPerks";
import { fetchMemberRoleInfo } from "@/lib/discordMember";
import { MAX_BADGES, pickBadges } from "@/lib/itemEffects";
import UserXp from "@/models/UserXp";

// 📌 프로필 배지 달기 · 떼기 · 자리 정하기 — 인벤토리 배지 창(app/components/Inventory BadgeWindow)이 부른다.
//    POST { order: [itemId, …], base? }  단 배지 전체를 이 순서로 저장(앞에서부터 1 · 2 · 3번 자리, 이름 옆에도 이 순서). [] = 모두 뗌
//         base: 화면이 보고 있던 단 목록(itemId 배열) — 지금 목록이 이것과 다르면 저장하지 않고 409 + { badges: 지금 목록 }(화면이 다시 맞춘다)
//    POST { itemId, on }          배지 하나 달기(on: true — 맨 뒤에 붙음) · 떼기(false)
//    가진 배지만 달 수 있다(보유 판정은 lib/itemPerks getPerks — 인벤토리와 같은 규칙). 최대 MAX_BADGES 개.
//    저장은 UserXp.badgePick 하나 — 안 고른 유저(칸 없음)가 처음 누르면 빈 목록에서 시작한다(자동으로 단 배지 없음).
//    반환: { badges } — 지금 단 배지 [{ itemId, name, icon, imageUrl, color, type }] (유저가 정한 순서)
const tooMany = () => NextResponse.json({ success: false, error: `배지는 ${MAX_BADGES}개까지 달 수 있습니다.` }, { status: 409 });
const bad = () => NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });

export async function POST(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    const maint = await denyIfMaintenance(auth.session);
    if (maint) return maint;
    if (!auth.userId) return NextResponse.json({ success: false, error: "디스코드 계정을 확인할 수 없습니다." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    // 📌 order 가 있으면 순서 저장, 없으면 예전 하나씩 달기 · 떼기
    const byOrder = body?.order !== undefined;
    let order = null;
    let base = null; // 화면이 보고 있던 단 목록(없으면 확인 없이 덮는다)
    let itemId = "";
    let on = false;
    if (byOrder) {
      if (!Array.isArray(body.order) || body.order.some((id) => typeof id !== "string" || !id.trim())) return bad();
      order = body.order.map((id) => id.trim());
      if (new Set(order).size !== order.length) return bad();
      if (order.length > MAX_BADGES) return tooMany();
      if (body.base !== undefined) {
        if (!Array.isArray(body.base) || body.base.some((id) => typeof id !== "string")) return bad();
        base = body.base.map((id) => id.trim());
      }
    } else {
      itemId = String(body?.itemId ?? "").trim();
      if (!itemId || typeof body?.on !== "boolean") return bad();
      on = body.on;
    }

    await connectToDatabase();
    // 📌 디스코드 역할을 확인하지 못하면 저장하지 않는다 — 역할로만 가진 배지(B)가 빠진 목록이 저장되면 확인이 돌아와도 떨어진 채로 남는다
    const { roles } = await fetchMemberRoleInfo(auth.userId).catch(() => ({ roles: null }));
    if (roles === null) {
      return NextResponse.json({ success: false, error: "잠시 후 다시 시도해 주세요." }, { status: 503 });
    }
    const { allBadges } = await getPerks(auth.userId, { heldRoles: roles });
    const owned = new Set(allBadges.map((b) => b.itemId));
    if (byOrder ? !order.every((id) => owned.has(id)) : !owned.has(itemId)) {
      return NextResponse.json({ success: false, error: "가지고 있지 않은 배지입니다." }, { status: 403 });
    }

    // 📌 읽은 목록이 그대로일 때만 쓴다 — 두 탭에서 동시에 누르면 한쪽 변경이 덮여 사라지므로, 바뀌었으면 다시 읽는다.
    //    { itemId, on } 은 읽은 목록에서 다시 계산하고, { order } 는 지금 목록이 base 와 같을 때만 쓴다(다르면 409 + 지금 목록 —
    //    옛 화면 · 역할 확인 실패로 B 가 빠져 보이던 화면의 순서가 B 를 지우지 않게).
    //    XP 문서가 없는 유저는 쓰기인 여기서 만든다(upsert) — 다른 요청이 먼저 만들었거나 목록이 바뀌었으면 11000 → 다시
    for (let tries = 0; tries < 3; tries++) {
      const doc = await UserXp.findOne({ userId: auth.userId }, { badgePick: 1 }).lean();
      const read = Array.isArray(doc?.badgePick) ? doc.badgePick : null; // null — 안 고름(칸 없음)
      // 지금 단 목록(가진 것만, 유저가 정한 순서 — 만료 · 환불된 id 는 여기서 빠진 채 저장된다)
      const worn = pickBadges(allBadges, read).map((b) => b.itemId);
      let next;
      if (byOrder) {
        if (base && worn.join("\n") !== base.join("\n")) {
          return NextResponse.json(
            { success: false, error: "배지가 바뀌어 다시 불러왔습니다.", data: { badges: pickBadges(allBadges, read) } },
            { status: 409 }
          );
        }
        next = order;
      } else {
        next = worn;
        if (on && !worn.includes(itemId)) {
          if (worn.length >= MAX_BADGES) return tooMany();
          next = [...worn, itemId];
        } else if (!on) {
          next = worn.filter((id) => id !== itemId);
        }
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
