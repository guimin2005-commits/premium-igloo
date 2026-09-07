import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import BotSetting from "@/models/BotSetting";

// 📌 ARCTIC 접근 권한 — 공개 전에는 관리자만 볼 수 있다
//    (레벨 대시보드 → 기본 정책 → "ARCTIC 공개" 토글로 전환)
export async function getShopAccess() {
  const session = await getServerSession(authOptions);
  const isAdmin = isAdminName(session?.user?.name);
  const setting = await BotSetting.findOne({ key: "main" }, { shopPublic: 1, levelPublic: 1 }).lean();
  // ARCTIC 은 /level 안에 있다 — SYSTEM : LEVEL 이 비공개면 상점만 열려 있을 수 없다
  const isPublic = !!setting?.shopPublic && !!setting?.levelPublic;

  return { session, isAdmin, isPublic, canView: isAdmin || isPublic };
}
