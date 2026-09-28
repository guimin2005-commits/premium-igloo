export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import RoleConfig from "@/models/RoleConfig";
import UserXp from "@/models/UserXp";

// 📌 봇이 역할 지급·XP 버프에 그대로 사용하는 설정이므로 전 메서드 관리자 전용

// 📌 보상 역할(지급 레벨 · 배타 티어)이 바뀌면 전원의 레벨 역할을 다시 맞춘다 — 새 티어를 붙이거나 떼도
//    이미 그 레벨인 유저는 레벨업이 다시 일어나지 않아 역할이 그대로 남기 때문. 봇(grantQueue)이 30초마다 50명씩 처리한다.
//    이미 세워진 유저는 건드리지 않는다(연달아 저장해도 쓰기가 늘지 않게). 실패해도 저장은 성공으로 둔다.
const requestRoleResync = async () => {
  try {
    await UserXp.updateMany({ needsRoleSync: { $ne: true } }, { $set: { needsRoleSync: true } });
  } catch (e) {
    console.error("역할 재동기화 표시 실패:", e?.message || e);
  }
};

// 역할 버프(buffXp · attendBuffXp)만 바뀐 저장은 레벨 역할과 무관하다
const rewardShape = (c) => `${c?.rewardLevel ?? "none"}:${!!c?.exclusive}`;

export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const configs = await RoleConfig.find().sort({ rewardLevel: 1, createdAt: 1 });
    return NextResponse.json({ success: true, data: configs });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const body = await request.json();
    if (!body.roleId?.trim()) {
      return NextResponse.json({ success: false, message: "역할을 선택해주세요." }, { status: 400 });
    }
    const prev = await RoleConfig.findOne({ roleId: body.roleId }, { rewardLevel: 1, exclusive: 1 }).lean();
    const config = await RoleConfig.findOneAndUpdate(
      { roleId: body.roleId },
      {
        roleName: body.roleName || "",
        rewardLevel: body.rewardLevel === "" || body.rewardLevel == null ? null : Number(body.rewardLevel),
        buffXp: Number(body.buffXp) || 0,
        attendBuffXp: Number(body.attendBuffXp) || 0,
        exclusive: !!body.exclusive,
      },
      { upsert: true, returnDocument: "after" }
    );
    // 새 보상 역할이거나 지급 레벨 · 배타 여부가 바뀌었을 때만 (버프만 있는 새 역할은 제외)
    const touchesReward = prev ? rewardShape(prev) !== rewardShape(config) : config?.rewardLevel != null;
    if (touchesReward) await requestRoleResync();
    return NextResponse.json({ success: true, data: config });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    const removed = await RoleConfig.findByIdAndDelete(id).lean();
    // 보상 역할을 지우면 배타 티어의 '최상위'가 달라질 수 있다 — 그 아래 티어를 다시 줘야 하는 유저가 생긴다
    if (removed?.rewardLevel != null) await requestRoleResync();
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
