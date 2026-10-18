// 📌 서버 전용 — 「유저 화면으로 보기」(lib/adminView) 를 따르는 관리자 판정. 라우트 핸들러 · 서버 컴포넌트에서만 import 한다(next/headers)
//    isAdminViewer(session): 관리자이고 유저 화면이 꺼져 있을 때만 true — 유저 화면에서 쓰는 조회 · 우회(숨김 글 · ?all=1 · 비공개 · 점검 · 인증)는 이걸로 가른다.
//    ⚠️ 권한 확인(관리자 API · 관리 쓰기)은 지금처럼 requireAdmin / denyIfNotAdmin(isAdminName) — 스위치와 상관없이 관리자는 관리자다.
//    관리 콘솔(/admin · /write) 화면이 부른 fetch 는 Referer 로 알아보고 스위치를 무시한다(콘솔은 늘 관리자 화면).
import { cookies, headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { VIEW_COOKIE, VIEW_USER, isConsolePath } from "@/lib/adminView";

// 관리 콘솔 화면이 부른 fetch 인지 — 페이지 이동(문서 · RSC)은 넘어온 곳이 콘솔이어도 아니다
function fromConsole(h) {
  if (h.get("sec-fetch-dest") === "document" || h.get("rsc")) return false;
  const ref = h.get("referer");
  if (!ref) return false;
  try { return isConsolePath(new URL(ref).pathname); } catch { return false; }
}

// 이 요청이 「유저 화면」으로 보는 중인지 (관리자 여부와 상관없는 쿠키 판정)
export async function isUserViewRequest() {
  try {
    const jar = await cookies();
    if (jar.get(VIEW_COOKIE)?.value !== VIEW_USER) return false;
    return !fromConsole(await headers());
  } catch (e) {
    unstable_rethrow(e);
    return false; // 요청 밖(스크립트 등) — 스위치 없음
  }
}

// 관리자로 보는 중인지 — session 을 안 주면 스스로 읽는다
export async function isAdminViewer(session) {
  const s = session === undefined ? await getServerSession(authOptions) : session;
  if (!isAdminName(s?.user?.name)) return false;
  return !(await isUserViewRequest());
}

// 서포터즈 입장(유저 화면에서 쓰는 조회 · 쓰기) — 역할 보유자, 그리고 관리자로 보는 중인 관리자. 유저 화면을 켠 관리자는 역할이 없으면 막힌다
//    (동기 isSupporterSession(lib/supporters) 은 스위치를 모른다 — 유저 화면 쪽 API 는 이걸 await 해서 쓴다)
export async function isSupporterViewer(session) {
  return !!session?.user?.isSupporter || (await isAdminViewer(session ?? null));
}
