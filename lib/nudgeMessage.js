/* 📌 캘린더 재촉 DM 문구 — 사이트 미리보기용
   ⚠️ bot/src/nudgeMessage.js 와 내용이 같아야 한다.
      봇은 Railway 에서 bot/ 만 배포되므로 이 파일을 import 할 수 없어 사본을 둔다.
      한쪽을 고치면 반드시 다른 쪽도 고칠 것. */

export const fmtKst = (d) =>
  new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

/* 관리자가 문구를 직접 쓰면 앞부분만 갈아끼운다.
   마감 시각과 링크는 항상 붙인다 — 그게 빠지면 받는 사람이 뭘 해야 할지 모른다. */
export const buildNudgeMessage = ({ teamName, url, dueAt, custom }) => {
  const head = (custom || "").trim() || [
    `⏰ **${teamName || "우리 팀"}** 스크림 캘린더에 아직 시간을 안 넣으셨습니다.`,
    "",
    "팀 일정은 전원이 넣어야 겹치는 시간이 나옵니다. 잠깐이면 됩니다.",
  ].join("\n");

  return [head, dueAt ? `마감 — **${fmtKst(dueAt)}**` : "", url || ""].filter(Boolean).join("\n");
};
