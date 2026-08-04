// 📌 선수 경매 — 게임별 포지션/슬롯 프리셋 + 역할 헬퍼 (서버/클라 공용)
//  · 기존 오버워치 전용 구조를 일반화. 하위호환: settings.roles 가 없으면 legacy slotTank/Dealer/Healer 로 해석.

// reveal: 스카우터 사용 시 공개되는 정보 (mainPos=주 포지션, subPos=부 포지션, champions=모스트 챔피언 3)
export const GAME_PRESETS = {
  "오버워치": {
    roles: [{ name: "탱커", count: 1 }, { name: "딜러", count: 2 }, { name: "힐러", count: 2 }],
    phase1Role: "탱커", // 선(先)경매 포지션 — 1페이즈에 먼저 경매
    reveal: ["mainPos", "subPos"],
  },
  "리그 오브 레전드": {
    roles: [{ name: "탑", count: 1 }, { name: "정글", count: 1 }, { name: "미드", count: 1 }, { name: "원딜", count: 1 }, { name: "서폿", count: 1 }],
    phase1Role: "",
    reveal: ["mainPos", "champions"],
  },
  "발로란트": {
    roles: [{ name: "타격대", count: 2 }, { name: "척후대", count: 1 }, { name: "감시자", count: 1 }, { name: "전략가", count: 1 }],
    phase1Role: "",
    reveal: ["mainPos", "subPos"],
  },
  "배틀그라운드": {
    roles: [{ name: "스쿼드", count: 4 }],
    phase1Role: "",
    reveal: ["mainPos"],
  },
  "커스텀": {
    roles: [],
    phase1Role: "",
    reveal: ["mainPos", "subPos"],
  },
};

export const GAME_LIST = ["오버워치", "리그 오브 레전드", "발로란트", "배틀그라운드", "커스텀"];

// 경매의 역할 목록 [{name,count}] — settings.roles 우선, 없으면 legacy 슬롯에서 유도
export const getRoles = (S) => {
  if (S?.roles?.length) return S.roles;
  return [
    { name: "탱커", count: S?.slotTank || 0 },
    { name: "딜러", count: S?.slotDealer || 0 },
    { name: "힐러", count: S?.slotHealer || 0 },
  ];
};

export const roleNames = (S) => getRoles(S).map((r) => r.name);

export const totalSlots = (S) => getRoles(S).reduce((a, r) => a + (r.count || 0), 0);

export const slotLimitOf = (S, slot) => getRoles(S).find((r) => r.name === slot)?.count || 0;

// 선경매(1페이즈) 포지션 — 없으면 단일 페이즈. 하위호환: roles 없는 legacy 는 오버워치(탱커).
export const phase1RoleOf = (S) => {
  if (S?.roles?.length) return S.phase1Role || "";
  return "탱커";
};
