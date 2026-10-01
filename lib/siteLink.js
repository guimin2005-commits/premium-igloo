// 📌 관리자가 넣은 링크가 우리 사이트 주소(https://www.premiumigloo.com/…)면 경로만 남긴다.
//    배너 링크를 실사이트 전체 주소로 넣으면 리뉴얼 · 로컬에서 눌러도 실사이트(다른 배포)로 넘어가 옛 화면이 열렸다(2026-10-01).
//    옛 상점 주소(/shop/…)는 지금 주소(/arctic/…)로 바꾼다(next.config 의 이동 규칙과 같다). 다른 사이트 주소는 그대로.
const SITE_HOST = /^(www\.)?premiumigloo\.com$/i;

export function siteHref(link) {
  const s = String(link || "").trim();
  if (!s) return "";
  let path = s;
  if (/^https?:\/\//i.test(s)) {
    let u;
    try { u = new URL(s); } catch { return s; }
    if (!SITE_HOST.test(u.hostname)) return s;
    path = u.pathname + u.search + u.hash;
  }
  if (!path.startsWith("/")) return path;
  if (path === "/shop/me" || path.startsWith("/shop/me?")) return path.replace("/shop/me", "/profile?from=arctic").replace("?from=arctic?", "?from=arctic&");
  return path.replace(/^\/shop(?=\/|\?|#|$)/, "/arctic");
}
