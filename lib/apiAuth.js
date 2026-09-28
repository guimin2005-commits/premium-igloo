// 📌 API 라우트 공용 인증 가드
//    클라이언트의 ADMIN_USERS 체크는 버튼을 숨기는 것뿐이므로, 쓰기·조회 권한은 반드시 서버에서 확인한다.
//    사용법: 핸들러 첫 줄에서 `const deny = await denyIfNotAdmin(); if (deny) return deny;`
//            또는 `const auth = await requireAdmin(); if (auth.deny) return auth.deny;`
//    관리자 판정은 lib/admins.js 의 isAdminName 하나 — 라우트마다 따로 만들지 말 것. 빠진 곳은 `npm run audit:api` 로 찾는다.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { connectToDatabase } from "@/lib/mongodb";
import Setting from "@/models/Setting";

export const getSession = () => getServerSession(authOptions);

// 📌 응답 모양은 { success:false, message, error } 한 벌 — 화면마다 message 를 읽기도, error 를 읽기도 한다
const fail = (msg, status) => NextResponse.json({ success: false, message: msg, error: msg }, { status });
const forbidden = () => fail("권한이 없습니다.", 403);

// 관리자 전용 — { deny } 또는 { session, name, userId }
export async function requireAdmin() {
  const session = await getSession();
  const name = session?.user?.name;
  if (!isAdminName(name)) return { deny: forbidden() };
  return { session, name, userId: session.user.id || "" };
}

// 관리자 전용 — 권한이 없으면 403 응답을 돌려준다 (통과 시 null)
export async function denyIfNotAdmin() {
  const { deny } = await requireAdmin();
  return deny || null;
}

// 로그인 필요 — { deny } 또는 { session, name, userId, isAdmin }
export async function requireUser() {
  const session = await getSession();
  const name = session?.user?.name;
  if (!name) {
    return { deny: fail("로그인이 필요합니다.", 401) };
  }
  return { session, name, userId: session.user.id || "", isAdmin: isAdminName(name) };
}

// 본인 또는 관리자만 — 남의 데이터를 조회·수정하지 못하게 한다
export async function requireSelfOrAdmin(targetName) {
  const auth = await requireUser();
  if (auth.deny) return auth;
  if (!auth.isAdmin && targetName && targetName !== auth.name) {
    return { deny: forbidden() };
  }
  return auth;
}

// 📌 점검 모드 — 켜져 있으면 쓰기 API(결제·강화·퀘스트·패스·쿠폰 등)를 서버에서 막는다. 관리자는 통과.
//    화면만 가리면 API 를 아는 유저는 그대로 쓴다. 요청마다 DB 를 치지 않게 10초 캐시 (켜고 끄는 반영도 10초 안)
//    사용법: `const m = await denyIfMaintenance(session); if (m) return m;` — session 을 안 주면 스스로 읽는다
const MAINTENANCE_TTL = 10_000;
let maintenanceCache = { on: false, at: 0 };

async function isMaintenanceOn() {
  if (Date.now() - maintenanceCache.at < MAINTENANCE_TTL) return maintenanceCache.on;
  try {
    await connectToDatabase();
    const doc = await Setting.findOne({ key: "maintenance" }, { value: 1 }).lean();
    maintenanceCache = { on: !!doc?.value, at: Date.now() };
  } catch (e) {
    // 설정을 못 읽으면 막지 않는다 — 점검 판정 실패로 전체 쓰기가 멈추면 안 된다 (직전 값 유지, 다음 요청에 다시 읽음)
    console.error("점검 모드 확인 실패:", e?.message || e);
  }
  return maintenanceCache.on;
}

// 점검 모드를 바꾼 직후 같은 서버에서 바로 반영하고 싶을 때 (app/api/settings 저장 뒤 등)
export const forgetMaintenanceCache = () => { maintenanceCache = { on: false, at: 0 }; };

export async function denyIfMaintenance(session) {
  if (!(await isMaintenanceOn())) return null;
  const s = session === undefined ? await getSession() : session;
  if (isAdminName(s?.user?.name)) return null;
  return fail("점검 중입니다. 잠시 후 다시 이용해 주세요.", 503);
}
