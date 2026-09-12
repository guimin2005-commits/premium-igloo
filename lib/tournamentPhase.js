/* 📌 대회 단계 — 서버·클라이언트 공용
   대회 하나가 글 하나로 끝까지 간다. 타입(모집/대진표)으로 글을 쪼개던 구조를 대체한다.

   실제 운영 리듬:
     토 (팀 배정 · 경매)  →  일주일 연습 주간  →  일 (대회 당일, 8강~결승을 하루에)

   phase 값이 비어 있으면 옛 글이므로 tournamentType 에서 유추한다. 마이그레이션이 필요 없다. */

export const PHASES = [
  { id: "접수", label: "참가 접수", code: "OPEN", desc: "참가 신청을 받는 중" },
  { id: "팀배정", label: "팀 배정", code: "DRAFT", desc: "경매로 팀을 나누는 날" },
  { id: "연습", label: "연습 주간", code: "PRACTICE", desc: "팀끼리 스크림을 잡는 기간" },
  { id: "당일", label: "대회 당일", code: "MATCHDAY", desc: "8강부터 결승까지 하루에" },
  { id: "종료", label: "종료", code: "CLOSED", desc: "모든 경기가 끝남" },
];

export const phaseMeta = (id) => PHASES.find((p) => p.id === id) || null;

const ymd = (d) => {
  const x = new Date(d);
  if (isNaN(x.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

// 한국 기준 오늘 (서버가 UTC 여도 같은 날짜가 나오도록)
export const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/* 📌 대회가 실제로 끝나는 날 — 대회 당일, 상세 일정의 마지막 종료일, 대표 기간 종료일 중 가장 늦은 날.
   이 날이 지나면 관리자가 단계를 안 바꿔도 종료로 본다 (끝난 대회가 '리그 진행중'으로 남지 않게). */
export const endDayOf = (post) => {
  if (!post) return "";
  const days = [ymd(post.tournamentEventDay)];
  if (Array.isArray(post.tournamentSchedule)) for (const ph of post.tournamentSchedule) days.push(ymd(ph?.end || ph?.start));
  const rep = (post.tournamentDate || "").split("~")[1]?.trim();
  if (rep) days.push(ymd(rep.replace(/\./g, "-")));
  return days.filter(Boolean).sort().pop() || "";
};

/* 글에서 현재 단계를 뽑는다.
   0) 관리자가 종료로 저장했거나 대회가 끝나는 날이 지났으면 무조건 종료.
   1) 관리자가 직접 지정한 phase 가 있으면 그것을 우선으로 쓴다.
   2) 없으면 팀 배정일·대회 당일로 날짜를 보고 판정한다.
   3) 그것도 없으면 옛 tournamentType 에서 유추한다. */
export const phaseOf = (post) => {
  if (!post) return "접수";
  const today = todayKST();
  const endDay = endDayOf(post);
  if (post.tournamentStatus === "종료됨" || (endDay && today > endDay)) return "종료";
  if (post.tournamentPhase) return post.tournamentPhase;

  const team = ymd(post.tournamentTeamDay);
  const event = ymd(post.tournamentEventDay);

  if (event && today > event) return "종료";
  if (event && today === event) return "당일";
  if (team && today === team) return "팀배정";
  if (team && event && today > team && today < event) return "연습";
  if (team && today < team) return "접수";

  return post.tournamentType === "대진표" ? "당일" : "접수";
};

/* 📌 대회 상태 배지 (모집중 / 진행중 / 예정됨 / 종료됨) — 단계에서 파생한다.
   저장된 tournamentStatus 는 단계와 어긋날 수 있으므로 화면은 항상 이 함수를 쓴다.
   단계·날짜가 하나도 없는 옛 글만 저장된 값을 그대로 따른다. */
export const statusFromPhase = (id) => (id === "접수" ? "모집중" : id === "종료" ? "종료됨" : "진행중");
export const statusOf = (post) => {
  if (!post) return "예정됨";
  const cur = phaseOf(post);
  if (cur === "종료") return "종료됨";
  const hasPhase = !!(post.tournamentPhase || post.tournamentEventDay || post.tournamentTeamDay);
  if (!hasPhase) return ["모집중", "진행중", "예정됨", "종료됨"].includes(post.tournamentStatus) ? post.tournamentStatus : "예정됨";
  return statusFromPhase(cur);
};

/* 📌 대진표를 지금 보여줘도 되는가.
   대진표는 연습 주간에 미리 짜두는 물건이라 '만드는 것'과 '보여주는 것'을 분리한다.
   대회 당일부터는 관리자 설정과 무관하게 항상 공개다 — 당일에 숨길 이유가 없다. */
export const bracketVisible = (post) => {
  if (!post?.tournamentBracket) return false;
  return phaseShows(phaseOf(post)).bracket || !!post.tournamentBracketPublic;
};

// 단계별로 그 글에서 무엇을 보여줄지 — 화면마다 조건을 따로 쓰면 어긋난다
export const phaseShows = (id) => ({
  survey: id === "접수",                       // 참가 신청 설문
  teams: id === "팀배정" || id === "연습" || id === "당일" || id === "종료",
  scrim: id === "연습",                        // 스크림 캘린더 안내
  bracket: id === "당일" || id === "종료",     // 대진표
  result: id === "종료",
});
