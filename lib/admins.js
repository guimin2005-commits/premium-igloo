// 📌 관리자 디스코드 닉네임 목록 (서버/클라이언트 공용)
export const ADMIN_USERS = ["elahw.06"];

export const isAdminName = (name) => !!name && ADMIN_USERS.includes(name);
