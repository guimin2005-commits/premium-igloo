export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { fetchMemberRoleInfo } from "@/lib/discordMember";
import { getShopAccess } from "@/lib/shopAccess";
import { buildInventory } from "@/lib/inventory";

// 📌 내 보유 아이템 — 구매 내역이 아니라 "지금 실제로 들고 있는 것"을 보여준다.
//    판정은 lib/inventory.js buildInventory 하나(관리자 유저 조회 인벤토리 app/api/admin/users/inventory 와 같은 판정).
//    여기서는 보는 사람 세션의 유저 · 디스코드 역할(60초 캐시) · 상점 접근(연장 링크)만 정해 넘긴다

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const userId = session.user.id;

    // 역할 · 상점 접근은 DB 조회와 함께 기다린다(buildInventory 의 Promise.all) — 상점을 못 보는 유저에게는 연장 링크를 주지 않는다
    const { synced, badges, cardSkin, items } = await buildInventory({
      userId,
      roleInfo: fetchMemberRoleInfo(userId),
      canRenew: getShopAccess().then((access) => !!access?.canView),
    });

    return NextResponse.json({
      success: true,
      data: {
        // 디스코드 조회에 실패하면 구매 내역 기준으로만 보여준다는 뜻
        synced,
        // 지금 단 프로필 배지 [{ itemId, name, icon, imageUrl, color, type }] (최대 3) · 지금 쓰는 카드 스킨 키("" 이면 기본 카드)
        badges,
        cardSkin,
        items,
      },
    });
  } catch (e) {
    console.error("보유 아이템 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
