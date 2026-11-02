// 📌 화면에 보이는 사람 이름 = 디스코드 서버 별명 — 2026-11-01 운영자 "페이지마다 닉네임 표기 다른 것 좀 통일해 · 서버 별명으로"(유저 화면만, 관리자 화면은 그대로)
//    · 내 이름: 세션 user.displayName(lib/authOptions — 길드 멤버 nick → 디스코드 표시 이름 → 계정 이름). session.user.name 은 계정 이름 그대로(관리자 판정 · 조회 · 저장 키)
//    · 남의 이름: UserXp.displayName(봇이 활동 때마다 적는 서버 별명 — 같은 차례) → lib/serverNames.js serverNamesOf
//    화면 · 서버 어디서나 쓰는 모듈(DB 없음)
export const nickOf = (user) => String(user?.displayName || user?.name || "").trim();
