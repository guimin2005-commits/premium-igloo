// 📌 명예의 전당 분류 공용 정의 — 공개 페이지와 관리 페이지가 같은 기준으로 묶고 부른다.

// 등재 시 고를 수 있는 분류 (대회 우승은 대회 글에서 자동 등재되므로 목록에는 두되 수동 등재도 허용)
export const HONOR_CATEGORIES = ["SYSTEM : LEVEL", "대회", "이벤트", "기타"];

// 필터/그룹 순서 — 대회를 앞에 둔다
export const HONOR_GROUPS = ["대회", "SYSTEM : LEVEL", "이벤트", "기타"];

// 대회 글에서 온 기록은 분류에 게임명(LEAGUE OF LEGENDS 등)이 들어오므로 항상 '대회'로 묶는다.
export const groupOf = (record) =>
  record?.source === "tournament"
    ? "대회"
    : HONOR_GROUPS.includes(record?.category)
      ? record.category
      : "기타";

// 그룹별 수식어 (영문) — 대회는 우승자, LEVEL은 1등
export const RANK_LABEL = {
  "대회": "Champion",
  "SYSTEM : LEVEL": "No. 1",
  "이벤트": "Winner",
  "기타": "Honoree",
};

// 필터 칩에 함께 적는 영문 라벨
export const GROUP_LABEL_EN = {
  "대회": "Tournament",
  "SYSTEM : LEVEL": "System : Level",
  "이벤트": "Event",
  "기타": "Etc",
};

export const rankLabelOf = (record) => RANK_LABEL[groupOf(record)] || "Honoree";
