// 📌 API 라우트 공용 인증 가드
//    클라이언트의 ADMIN_USERS 체크는 버튼을 숨기는 것뿐이므로, 쓰기·조회 권한은 반드시 서버에서 확인한다.
//    사용법: 핸들러 첫 줄에서 `const deny = await denyIfNotAdmin(); if (deny) return deny;`

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";

export const getSession = () => getServerSession(authOptions);

// 관리자 전용 — 권한이 없으면 403 응답을 돌려준다 (통과 시 null)
export async function denyIfNotAdmin() {
  const session = await getSession();
  if (!isAdminName(session?.user?.name)) {
    return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
  }
  return null;
}

// 로그인 필요 — { deny } 또는 { session, name, userId, isAdmin }
export async function requireUser() {
  const session = await getSession();
  const name = session?.user?.name;
  if (!name) {
    return { deny: NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  return { session, name, userId: session.user.id || "", isAdmin: isAdminName(name) };
}

// 본인 또는 관리자만 — 남의 데이터를 조회·수정하지 못하게 한다
export async function requireSelfOrAdmin(targetName) {
  const auth = await requireUser();
  if (auth.deny) return auth;
  if (!auth.isAdmin && targetName && targetName !== auth.name) {
    return { deny: NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 }) };
  }
  return auth;
}
