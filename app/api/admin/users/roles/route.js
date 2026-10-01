export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { fetchGuildMember, forgetGuildMember } from "@/lib/discordMember";
import RoleConfig from "@/models/RoleConfig";
import Purchase from "@/models/Purchase";

// 📌 관리 › 유저 조회 › 역할 — 한 사람의 디스코드 역할을 보고 하나씩 뗀다(관리자 전용).
//    GET  ?userId=  → 지금 가진 역할(높은 순) + 출처 꼬리(레벨 보상 · 보유 아이템). 디스코드에 새로 묻는다(멤버 캐시 건너뜀)
//    POST { userId, roleId } → 디스코드에서 그 역할을 뗀다. 사이트 기록(구매 · 인벤토리)은 건드리지 않는다.
//    📌 디스코드가 관리하는 역할(부스터 · 봇 연동)은 뗄 수 없어 막고, 레벨 보상 역할은 봇이 레벨에 맞춰 다시 붙이므로 막는다.
//       봇 역할보다 높은 역할은 디스코드가 거절한다(50013) — 그대로 알린다.
const SNOWFLAKE = /^\d{5,25}$/;
const GUILD = () => process.env.DISCORD_GUILD_ID;
const TOKEN = () => process.env.DISCORD_BOT_TOKEN;

async function guildRoles() {
  const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD()}/roles`, {
    headers: { Authorization: `Bot ${TOKEN()}` },
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function GET(request) {
  try {
    const { deny } = await requireAdmin();
    if (deny) return deny;
    const userId = String(new URL(request.url).searchParams.get("userId") || "").trim();
    if (!SNOWFLAKE.test(userId)) return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    if (!GUILD() || !TOKEN()) return NextResponse.json({ success: false, message: "디스코드 설정이 없습니다." }, { status: 500 });

    const [m, all] = await Promise.all([fetchGuildMember(userId, { fresh: true }), guildRoles()]);
    if (m.status === "absent") return NextResponse.json({ success: true, data: { present: false, roles: [] } });
    if (m.status !== "ok" || !all) return NextResponse.json({ success: false, message: "디스코드에서 역할을 읽지 못했습니다." }, { status: 502 });

    const held = new Set(m.member?.roles || []);
    const roles = all.filter((r) => held.has(r.id)).sort((a, b) => b.position - a.position);
    const ids = roles.map((r) => r.id);

    await connectToDatabase();
    const now = new Date();
    const [cfgs, owned] = await Promise.all([
      RoleConfig.find({ roleId: { $in: ids }, rewardLevel: { $gt: 0 } }, { roleId: 1, rewardLevel: 1 }).lean(),
      // 이 역할을 주는 살아 있는 사이트 기록 — 대기 · 완료, 소모 안 됨, 만료 전
      Purchase.find(
        { userId, roleId: { $in: ids }, status: { $in: ["pending", "completed"] }, consumedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        { roleId: 1, itemName: 1 }
      ).lean(),
    ]);
    const levelOf = new Map(cfgs.map((c) => [c.roleId, c.rewardLevel]));
    const itemOf = new Map();
    for (const p of owned) if (!itemOf.has(p.roleId)) itemOf.set(p.roleId, p.itemName || "아이템");

    const data = roles.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : "#99aab5",
      managed: !!r.managed,
      rewardLevel: levelOf.get(r.id) ?? null,
      item: itemOf.get(r.id) || "",
    }));
    return NextResponse.json({ success: true, data: { present: true, roles: data } });
  } catch (e) {
    console.error("유저 역할 조회 오류:", e);
    return NextResponse.json({ success: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { deny } = await requireAdmin();
    if (deny) return deny;
    const { userId, roleId } = await request.json();
    const uid = String(userId || "").trim();
    const rid = String(roleId || "").trim();
    if (!SNOWFLAKE.test(uid) || !SNOWFLAKE.test(rid) || rid === GUILD()) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }
    const all = await guildRoles();
    const role = all?.find((r) => r.id === rid);
    if (!role) return NextResponse.json({ success: false, message: "서버에 없는 역할입니다." }, { status: 404 });
    if (role.managed) return NextResponse.json({ success: false, message: "디스코드가 관리하는 역할이라 뗄 수 없습니다." }, { status: 400 });
    await connectToDatabase();
    if (await RoleConfig.exists({ roleId: rid, rewardLevel: { $gt: 0 } })) {
      return NextResponse.json({ success: false, message: "레벨 보상 역할은 봇이 레벨에 맞춰 다시 붙입니다." }, { status: 400 });
    }

    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD()}/members/${uid}/roles/${rid}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${TOKEN()}`, "X-Audit-Log-Reason": encodeURIComponent("관리자 회수 (유저 조회)") },
    });
    forgetGuildMember(uid);
    if (res.status === 204 || res.ok) return NextResponse.json({ success: true, message: `${role.name} 역할을 회수했습니다.` });
    const body = await res.json().catch(() => null);
    if (body?.code === 50013) return NextResponse.json({ success: false, message: "봇 역할보다 높은 역할이라 뗄 수 없습니다." }, { status: 403 });
    if (body?.code === 10007) return NextResponse.json({ success: false, message: "서버에 없는 유저입니다." }, { status: 404 });
    return NextResponse.json({ success: false, message: "디스코드에서 처리하지 못했습니다." }, { status: 502 });
  } catch (e) {
    console.error("유저 역할 회수 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
