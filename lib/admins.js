// 📌 관리자 디스코드 닉네임 목록 (서버/클라이언트 공용)
//    isAdminName 은 "관리자인가"(권한)만 — 유저 화면에서 관리 UI · 숨김 데이터를 보일지는 「유저 화면으로 보기」를 따른다:
//    화면은 app/components/AdminView 의 useAdminView().admin, 서버 조회 · 우회는 lib/adminViewServer 의 isAdminViewer(session)
export const ADMIN_USERS = ["elahw.06"];

export const isAdminName = (name) => !!name && ADMIN_USERS.includes(name);

// 📌 유저에게 보이는 문구 끝의 " (<관리자 이름>)" 을 뗀다 — 예전 기본 사유 · 메모("관리자 지급 (elahw.06)")가 이름을 달고 저장됐다.
//    지금은 이름을 문구에 넣지 않고 따로 적는다(Payout.by). 관리자 이름 목록 + "admin"(세션 이름이 없을 때 넣던 값)만 뗀다
const TAG_NAMES = [...ADMIN_USERS, "admin"];
export const stripAdminTag = (text) => {
  const s = String(text ?? "").trimEnd();
  for (const n of TAG_NAMES) {
    const tail = ` (${n})`;
    if (s.endsWith(tail)) return s.slice(0, -tail.length).trimEnd();
  }
  return s;
};
