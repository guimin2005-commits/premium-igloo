export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { getGuildRoster } from "@/lib/guildRoster";
import { fetchGuildMember } from "@/lib/discordMember";
import Coupon from "@/models/Coupon";
import UserCoupon from "@/models/UserCoupon";
import UserXp from "@/models/UserXp";

// 서버 멤버 표시 이름 — 별명 > 전역 이름 > 사용자명 (lib/guildRoster 의 name 과 같은 순서)
const memberName = (m) => String(m?.nick || m?.user?.global_name || m?.user?.username || "");

// ── [지급] 관리자가 유저 지갑에 쿠폰을 넣어준다 ──
//    target: 디스코드 닉네임 또는 유저 ID · "all"이면 전원
//    📌 2026-10-04 "XP 기록이 있어야 한다는 건 수정이 좀 필요" — XP 기록(UserXp)이 없는 서버 멤버(아직 채팅 · 음성을 안 한 신규 멤버)도 받는다.
//       전체 = XP 기록이 있는 사람 + 지금 서버 멤버 전원(봇 제외 — lib/guildRoster, 역할 이전과 같은 멤버 명단).
//       명단을 못 받으면 지급하지 않는다(일부에게만 들어가지 않게 — 다시 시도).
//       한 명 = XP 기록에서 ID · 사용자명 · 표시 이름으로 찾고, 없으면 서버 멤버에서 ID(멤버 조회) · 서버 표시 이름(명단)으로 찾는다
export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;

    await connectToDatabase();
    const { couponId, target } = await request.json();
    const coupon = await Coupon.findById(couponId).lean();
    if (!coupon) {
      return NextResponse.json({ success: false, message: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
    }

    // 대상 유저 결정
    let targets = [];
    if (target === "all") {
      let roster;
      try {
        roster = await getGuildRoster({ fresh: true });
      } catch (e) {
        console.error("쿠폰 전체 지급 — 멤버 명단 조회 실패:", e?.message || e);
        return NextResponse.json({ success: false, message: "디스코드 멤버 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
      }
      const byId = new Map((await UserXp.find({}, { userId: 1, displayName: 1, username: 1 }).lean()).map((r) => [r.userId, r]));
      for (const m of roster.members) {
        if (m.bot || !m.id || byId.has(m.id)) continue;
        byId.set(m.id, { userId: m.id, displayName: m.name, username: "" });
      }
      targets = [...byId.values()];
    } else {
      const key = (target || "").trim();
      if (!key) {
        return NextResponse.json({ success: false, message: "지급 대상을 입력해주세요." }, { status: 400 });
      }
      // 유저 ID 가 맞으면 그 한 명만 — 아니면 사용자명 · 표시 이름으로 찾되, 여러 명이 걸리면 아무에게도 주지 않는다 (동명이인)
      targets = await UserXp.find({ userId: key }, { userId: 1, displayName: 1, username: 1 }).lean();
      if (targets.length === 0) {
        targets = await UserXp.find({ $or: [{ username: key }, { displayName: key }] }, { userId: 1, displayName: 1, username: 1 }).lean();
      }
      // XP 기록에 없으면 서버 멤버에서 — ID 는 멤버 한 명 조회, 이름은 멤버 명단(서버 표시 이름)으로
      if (targets.length === 0 && /^\d{15,25}$/.test(key)) {
        const r = await fetchGuildMember(key);
        if (r.status === "ok" && !r.member?.user?.bot) targets = [{ userId: key, displayName: memberName(r.member), username: String(r.member?.user?.username || "") }];
      }
      if (targets.length === 0) {
        const roster = await getGuildRoster().catch(() => null);
        targets = (roster?.members || []).filter((m) => !m.bot && m.name === key).map((m) => ({ userId: m.id, displayName: m.name, username: "" }));
      }
      if (targets.length > 1) {
        return NextResponse.json({
          success: false,
          message: `같은 이름의 유저가 ${targets.length}명입니다. 유저 ID로 지정해 주세요. (${targets.slice(0, 5).map((r) => `${r.displayName || r.username || "이름 없음"} ${r.userId}`).join(", ")})`,
        }, { status: 409 });
      }
      if (targets.length === 0) {
        return NextResponse.json({ success: false, message: "해당 유저를 찾을 수 없습니다." }, { status: 404 });
      }
    }

    // 이미 미사용으로 보유 중인 유저는 건너뛴다
    const already = await UserCoupon.find(
      { couponId: String(coupon._id), status: "unused", userId: { $in: targets.map((t) => t.userId) } },
      { userId: 1 }
    ).lean();
    const skip = new Set(already.map((a) => a.userId));

    const rows = targets
      .filter((t) => !skip.has(t.userId))
      .map((t) => ({
        userId: t.userId,
        userName: t.displayName || t.username || "",
        couponId: String(coupon._id),
        code: coupon.code,
        source: "admin",
      }));

    if (rows.length > 0) await UserCoupon.insertMany(rows);

    return NextResponse.json({
      success: true,
      message: `${rows.length}명에게 지급했습니다.${skip.size > 0 ? ` (이미 보유 ${skip.size}명 제외)` : ""}`,
    });
  } catch (e) {
    console.error("쿠폰 지급 오류:", e);
    return NextResponse.json({ success: false, message: "지급 중 오류가 발생했습니다." }, { status: 500 });
  }
}
