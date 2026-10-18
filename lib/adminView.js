// 📌 관리자 「유저 화면으로 보기」 (2026-10-17 운영자 결정) — 서버 · 브라우저 공용 값 (next/headers 를 여기서 부르지 말 것: 화면 쪽도 이 파일을 읽는다)
//    쿠키 igloo-view=user 한 장이 켜짐이다. 켜면 관리자도 같은 계정의 일반 유저와 똑같이 본다 —
//    관리 단추 · 링크 · 딱지 없음, 숨김 · 예약 · 꺼진 것 없음, 닫힌 곳(레벨 · ARCTIC 예고 · 점검)도 유저처럼 막힘, 서버 조회 · 쓰기 우회도 유저처럼.
//    화면은 app/components/AdminView 의 useAdminView().admin, 서버는 lib/adminViewServer 의 isAdminViewer(session) 로 읽는다.
//    ⚠️ 관리 콘솔(/admin · /write)은 스위치와 상관없이 관리자 그대로 — 거기서 부르는 조회(?all=1 등)도 그대로 돌아간다
export const VIEW_COOKIE = "igloo-view";
export const VIEW_USER = "user";
export const VIEW_MAX_AGE = 60 * 60 * 24 * 365; // 1년(초)

// 관리 콘솔 경로 — 스위치를 켜도 관리자 화면 그대로인 곳
export const isConsolePath = (path) =>
  !!path && (path === "/admin" || path.startsWith("/admin/") || path === "/write");

// 쿠키 문자열(document.cookie · Cookie 헤더)에서 켜짐 여부
export const isUserViewCookie = (cookieStr) =>
  String(cookieStr || "")
    .split(";")
    .some((p) => p.trim() === `${VIEW_COOKIE}=${VIEW_USER}`);

// ── 브라우저 전용 ─────────────────────────────────────────
export const readUserViewCookie = () => (typeof document === "undefined" ? false : isUserViewCookie(document.cookie));

// 켜기: 1년 · path=/ · SameSite=Lax (https 면 Secure) / 끄기: 지운다
export function writeUserViewCookie(on) {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = on
    ? `${VIEW_COOKIE}=${VIEW_USER}; Max-Age=${VIEW_MAX_AGE}; Path=/; SameSite=Lax${secure}`
    : `${VIEW_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}
