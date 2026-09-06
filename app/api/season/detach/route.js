export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import BotSetting from "@/models/BotSetting";
import ShopItem from "@/models/ShopItem";
import Purchase from "@/models/Purchase";

// ── [시즌 전환] 디스코드 역할 표기 떼기 (관리자 전용) ──
//    회수가 아니다. 소유(Purchase)는 그대로 두고 siteOnly 만 세워
//    디스코드에서의 표기만 내린다 — 인벤토리에는 계속 남는다.
//    실제 역할 제거는 봇의 자동 지급 큐(processDetachments)가 맡으므로
//    여기서는 "뗄 대상" 표시만 하고 디스코드는 건드리지 않는다.
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }

    await connectToDatabase();
    const body = await request.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;

    // 표기를 뗄 역할 — 권한 상품(perk)은 역할이 곧 디스코드 기능이라 떼면 기능이 사라진다
    const items = await ShopItem.find(
      { detachOnSeason: true, type: { $ne: "perk" }, roleId: { $ne: "" } },
      { name: 1, roleId: 1 }
    ).lean();

    // 펭귄 등급처럼 관리자가 잠가 둔 역할은 상품으로 팔렸더라도 예외 없이 제외한다
    const setting = await BotSetting.findOne({ key: "main" }, { protectedRoleIds: 1 }).lean();
    const protectedIds = new Set(setting?.protectedRoleIds || []);

    const targets = items.filter((it) => !protectedIds.has(it.roleId));
    const roleIds = [...new Set(targets.map((it) => it.roleId))];
    if (roleIds.length === 0) {
      return NextResponse.json({ success: true, dryRun, matched: 0, updated: 0, items: [] });
    }

    // 이미 사이트 보유로 넘긴 건(siteOnly)은 다시 세지 않는다 — 여러 번 눌러도 안전하다
    //
    // ⚠️ siteOnly: false 로 쓰면 안 된다.
    //    siteOnly 는 이번 리뉴얼에서 새로 생긴 필드라 기존 구매 문서에는 키 자체가 없고,
    //    MongoDB 의 { siteOnly: false } 는 "필드가 없는 문서"를 매칭하지 않는다
    //    (Mongoose 의 default 는 저장 시점에만 붙지, 쿼리 필터에 소급 적용되지 않는다).
    //    그래서 등호로 두면 이 기능이 필요한 첫 시즌 전환에서 대상이 0건이 된다.
    //    $ne: true 는 "없음"과 false 를 함께 잡고, 이미 처리한 true 건은 계속 제외해 재실행도 안전하다.
    //
    //    다만 봇이 "영구 실패"로 판정해 큐에서 뺀 건(roleDetached: true + error)은 다시 잡아야 한다.
    //    50013(봇 역할이 판매 역할보다 아래)은 관리자가 30초면 고치는 설정 문제인데,
    //    그대로 두면 siteOnly: true 라 이 필터에서 영영 빠져 재시도할 방법이 없어진다.
    //    아래에서 error 를 비워 주므로 "다시 실행" 이 곧 실패건 재시도가 된다.
    const filter = {
      status: "completed",
      itemType: { $ne: "perk" },
      roleId: { $in: roleIds },
      $or: [{ siteOnly: { $ne: true } }, { siteOnly: true, roleDetached: true, error: /^영구 실패/ }],
    };

    // 무엇이 얼마나 바뀌는지 미리 보여 주려고 상품명·역할별로 묶어 센다
    // (같은 역할을 이름이 다른 상품으로 팔았을 수 있어 둘을 함께 키로 쓴다)
    const grouped = await Purchase.aggregate([
      { $match: filter },
      { $group: { _id: { roleId: "$roleId", itemName: "$itemName" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const nameByRole = new Map(targets.map((it) => [it.roleId, it.name]));
    const rows = grouped.map((g) => ({
      itemName: g._id.itemName || nameByRole.get(g._id.roleId) || "(이름 없음)",
      roleId: g._id.roleId,
      count: g.count,
    }));
    const matched = rows.reduce((sum, r) => sum + r.count, 0);

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, matched, updated: 0, items: rows });
    }

    // roleDetached 를 내려 두어야 봇이 이번 전환 건을 새로 집어 간다
    const res = await Purchase.updateMany(filter, {
      // error 도 함께 비운다 — 지난 실패 사유가 남아 있으면 봇이 실패건으로 오인해 뒤로 미룬다
      $set: { siteOnly: true, siteOnlyAt: new Date(), roleDetached: false, error: "" },
    });

    console.log(`🧊 시즌 전환 표기 이전: ${res.modifiedCount || 0}건 (${roleIds.length}개 역할)`);
    return NextResponse.json({
      success: true,
      dryRun: false,
      matched,
      updated: res.modifiedCount || 0,
      items: rows,
    });
  } catch (e) {
    console.error("시즌 전환 표기 이전 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
