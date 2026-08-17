/* 📌 캘린더 재촉 DM 문구
   ⚠️ lib/nudgeMessage.js (사이트) 와 내용이 같아야 한다.
      Railway 는 bot/ 만 배포하므로 사이트 쪽 파일을 import 할 수 없어 사본을 둔다.
      한쪽을 고치면 반드시 다른 쪽도 고칠 것.
   평소에는 사이트가 문구를 완성해 넣어주고, 이건 옛 기록용 폴백이다. */

export const fmtKst = (d) =>
  new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

export const buildNudgeMessage = ({ teamName, url, dueAt, custom }) => {
  const head = (custom || "").trim() || [
    `⏰ **${teamName || "우리 팀"}** 스크림 캘린더에 아직 시간을 안 넣으셨습니다.`,
    "",
    "팀 일정은 전원이 넣어야 겹치는 시간이 나옵니다. 잠깐이면 됩니다.",
  ].join("\n");

  return [head, dueAt ? `마감 — **${fmtKst(dueAt)}**` : "", url || ""].filter(Boolean).join("\n");
};
