export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { fetchGuildMember, forgetGuildMember } from "@/lib/discordMember";
import { buildInventory } from "@/lib/inventory";
import { revokeFreeRows } from "@/lib/itemRevoke";
import { settleOrders } from "@/lib/orderRefund";
import { TOOL_RE } from "@/lib/roleMigrationTerms";
import UserXp from "@/models/UserXp";

// 📌 관리 › 유저 조회 › 인벤토리 — 한 사람의 보유 아이템을 유저 인벤토리와 같은 판정(lib/inventory.js)으로 보고, 카드 단위로 회수한다(관리자 전용).
//    GET  ?userId=  → { synced, canGrant(UserXp 있음 — 아이템 지급 대상), items: 카드(유저 인벤토리와 같은 필드 + revoke) }
//         디스코드 역할은 새로 묻는다(멤버 캐시 건너뜀). 연장 링크(renewId)는 주지 않는다
//    POST { userId, key, qty?, expect } → 그 카드(revoke.mode "rows")의 건을 회수한다.
//         📌 서버가 이 유저의 건을 DB 에서 다시 모아 GET 과 같은 순서 · 같은 규칙으로 고른다(화면이 보낸 id 를 믿지 않는다).
//            expect(화면이 본 max)가 지금 max 와 다르면 409 — 그 사이 지급 · 소모 · 환불이 끼었으면 다시 보고 누르게
//         · 낸 값 없는 건(운영진 지급 · 시즌 패스) — lib/itemRevoke.js revokeFreeRows(대기 → 취소, 보유 → 회수)
//         · 상점 구매 — lib/orderRefund.js settleOrders(관리자 주문 환불과 똑같이 낸 값 · 캐시백 · 재고 · 레벨까지 되돌린다), 메모 "운영진 회수"
//         · 실물 · 역할 이전 기록 · 소모된 건 · 만료된 건은 고르지 않는다(lib/inventory.js revokePlanOf)
//    역할로만 가진 카드(revoke.mode "role")는 화면이 POST /api/admin/users/roles 로 뗀다. 레벨 보상은 잠금
const SNOWFLAKE = /^\d{5,25}$/;
const KEY_RE = /^(t:[is]:[0-9a-f]{24}|c:[0-9a-f]{24})$/i;
const NOTE = "운영진 회수";
// 역할을 모를 때(POST) — (B) 역할 카드는 빠지고 (A) 구매 건 카드 · 회수 범위는 GET 과 같다
const UNKNOWN_ROLES = { roles: null, at: 0, stale: true };

// 디스코드 역할 — 캐시를 건너뛰고 새로 묻는다. fetchMemberRoleInfo 와 같은 모양(서버에 없으면 [], 확인 실패면 null)
async function freshRoleInfo(userId) {
  const r = await fetchGuildMember(userId, { fresh: true });
  const roles = r.status === "ok" ? (Array.isArray(r.member?.roles) ? r.member.roles : []) : r.status === "absent" ? [] : null;
  return { roles, at: r.at || 0, stale: !!r.stale };
}

// 디스코드가 관리하는 역할(부스터 · 봇 연동) — 뗄 수 없어 잠근다. 역할 목록은 유저 조회 › 역할(app/api/admin/users/roles)과 같은 주소(5분 캐시). 못 읽으면 null(잠그지 않고 역할 회수 API 가 거절한다)
async function managedRoleIds() {
  const GUILD = process.env.DISCORD_GUILD_ID;
  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!GUILD || !TOKEN) return null;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD}/roles`, {
      headers: { Authorization: `Bot ${TOKEN}` },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const list = await res.json();
    return new Set((Array.isArray(list) ? list : []).filter((r) => r?.managed).map((r) => String(r.id)));
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const { deny } = await requireAdmin();
    if (deny) return deny;
    const userId = String(new URL(request.url).searchParams.get("userId") || "").trim();
    if (!SNOWFLAKE.test(userId)) return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    await connectToDatabase();

    const [inv, xp] = await Promise.all([
      buildInventory({ userId, roleInfo: freshRoleInfo(userId), canRenew: false, admin: true, managedRoles: managedRoleIds() }),
      UserXp.exists({ userId }),
    ]);
    return NextResponse.json({ success: true, data: { synced: inv.synced, canGrant: !!xp, items: inv.items } });
  } catch (e) {
    console.error("유저 인벤토리 조회 오류:", e);
    return NextResponse.json({ success: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    const b = await request.json().catch(() => ({}));
    const userId = String(b?.userId || "").trim();
    const key = String(b?.key || "").trim();
    if (!SNOWFLAKE.test(userId) || !KEY_RE.test(key)) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }
    await connectToDatabase();

    // 📌 GET 과 같은 판정으로 다시 모은다 — 고를 건 · 순서는 GET 의 revoke.units 와 같다
    const inv = await buildInventory({ userId, roleInfo: UNKNOWN_ROLES, canRenew: false, admin: true });
    const plan = inv.plans?.get(key) || null;
    const max = plan ? plan.rows.length : 0;
    if (Number(b?.expect) !== max) {
      return NextResponse.json({ success: false, message: "목록이 바뀌었습니다. 다시 불러 주세요." }, { status: 409 });
    }
    if (!max) return NextResponse.json({ success: false, message: "회수할 수 있는 건이 없습니다." }, { status: 409 });
    let qty = max;
    if (plan.stack) {
      qty = Number(b?.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > max) {
        return NextResponse.json({ success: false, message: "수량이 올바르지 않습니다." }, { status: 400 });
      }
    }
    const pick = plan.rows.slice(0, qty);

    const at = new Date();
    // 고른 뒤 바뀐 건은 건드리지 않는다 — 이 유저 · 실물 아님 · 기간 남음(상태 · 소모 조건은 각 함수가 건다)
    const alive = { userId, itemType: { $ne: "physical" }, $or: [{ expiresAt: null }, { expiresAt: { $gt: at } }] };
    const isShop = (p) => p.itemId !== "grant" && p.itemId !== "season-pass";

    // 낸 값 없는 건 — 운영진 지급 · 시즌 패스. 역할 이전 · 환불 도구의 기록은 조건으로도 한 번 더 막는다
    const freeIds = pick.filter((p) => !isShop(p)).map((p) => String(p._id));
    const free = freeIds.length
      ? await revokeFreeRows({ ids: freeIds, userId, extra: { ...alive, itemId: { $in: ["grant", "season-pass"] }, adminNote: { $not: TOOL_RE } }, at })
      : { done: 0 };

    // 상점 구매 — 대기는 취소, 보유는 환불(관리자 주문 처리와 같은 전환). 고른 사이 봇이 지급을 끝낸 대기 건은 환불로 이어서 처리한다
    const shop = pick.filter(isShop);
    const pendIds = shop.filter((p) => p.status === "pending").map((p) => String(p._id));
    const doneIds = shop.filter((p) => p.status !== "pending").map((p) => String(p._id));
    const none = { done: [], refundXp: 0, refundPoint: 0 };
    const cancelled = pendIds.length ? await settleOrders({ ids: pendIds, status: "cancelled", adminNote: NOTE, match: alive, at }) : none;
    const cancelledIds = new Set(cancelled.done.map((d) => String(d._id)));
    const refundIds = [...doneIds, ...pendIds.filter((id) => !cancelledIds.has(id))];
    const refunded = refundIds.length ? await settleOrders({ ids: refundIds, status: "refunded", adminNote: NOTE, match: alive, at }) : none;

    forgetGuildMember(userId);
    const done = free.done + cancelled.done.length + refunded.done.length;
    const refundXp = cancelled.refundXp + refunded.refundXp;
    const refundPoint = cancelled.refundPoint + refunded.refundPoint;
    if (!done) return NextResponse.json({ success: false, message: "목록이 바뀌었습니다. 다시 불러 주세요." }, { status: 409 });

    console.log(`🧾 인벤토리 회수: ${userId} · ${key} · ${auth.name || "admin"} · ${done}건 · 환불 ${refundXp} XP · ${refundPoint} 빙옥`);
    const back = [refundXp > 0 ? `${refundXp.toLocaleString("ko-KR")} XP` : "", refundPoint > 0 ? `${refundPoint.toLocaleString("ko-KR")} 빙옥` : ""].filter(Boolean);
    return NextResponse.json({
      success: true,
      message: `${plan.name} ${done}건을 회수했습니다.${back.length ? `\n환불 ${back.join(" · ")}` : ""}`,
      data: { done, refundXp, refundPoint },
    });
  } catch (e) {
    console.error("유저 인벤토리 회수 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
