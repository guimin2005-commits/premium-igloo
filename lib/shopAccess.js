import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { isAdminViewer } from "@/lib/adminViewServer";
import BotSetting from "@/models/BotSetting";

// 📌 ARCTIC 접근 권한 — 공개 전에는 관리자만 볼 수 있다
//    (레벨 대시보드 → 기본 정책 → "ARCTIC 공개" 토글로 전환)
//    📌 isAdmin 은 "관리자로 보는 중" — 「유저 화면으로 보기」(lib/adminView)를 켜면 false 라 비공개 우회 · ?all=1 숨김 상품이 없다.
//       관리 콘솔(/admin · /write)에서 부른 조회는 그대로 관리자. 스위치와 상관없는 관리자 여부는 realAdmin
export async function getShopAccess() {
  const session = await getServerSession(authOptions);
  const realAdmin = isAdminName(session?.user?.name);
  const isAdmin = realAdmin && (await isAdminViewer(session));
  const setting = await BotSetting.findOne({ key: "main" }, { shopPublic: 1, levelPublic: 1 }).lean();
  // ARCTIC 은 /level 안에 있다 — SYSTEM : LEVEL 이 비공개면 상점만 열려 있을 수 없다
  const isPublic = !!setting?.shopPublic && !!setting?.levelPublic;

  return { session, isAdmin, realAdmin, isPublic, canView: isAdmin || isPublic };
}
