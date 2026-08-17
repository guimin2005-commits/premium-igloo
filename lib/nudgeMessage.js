/* 📌 캘린더 재촉 DM 문구
   ⚠️ bot/src/nudgeMessage.js 와 내용이 같아야 한다.
      Railway 는 bot/ 만 배포하므로 사이트 쪽 파일을 import 할 수 없어 사본을 둔다.
      한쪽을 고치면 반드시 다른 쪽도 고칠 것.

   봇은 이걸로 디스코드 임베드를 만들고, 사이트는 같은 값으로 미리보기를 그린다.
   그래서 여기서는 '문장'만 정하고 생김새는 각자 맡는다. */

export const NUDGE_COLOR = 0x00e07b;
export const NUDGE_AUTHOR = "고급 이글루 · 대회 룸";
export const NUDGE_TITLE = "스크림 캘린더가 아직 비어 있습니다";
export const NUDGE_FOOTER = "가능한 시간만 칠하면 됩니다 · 1분이면 끝납니다";
export const NUDGE_CTA = "캘린더 열기";

export const DEFAULT_BODY =
  "팀 전원이 넣어야 겹치는 시간이 나옵니다.\n한 명이 비면 그 시간대는 잡을 수 없습니다.";

// 관리자가 문구를 직접 쓰면 본문만 갈아끼운다. 제목·마감·링크는 그대로 간다.
export const nudgeBody = (custom) => (custom || "").trim() || DEFAULT_BODY;

export const fmtKst = (d) =>
  new Date(d).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  });

// 마감까지 남은 시간 — "3일 후" / "5시간 후" / "지남"
export const untilLabel = (d) => {
  const ms = new Date(d).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "마감 지남";
  const h = Math.floor(ms / 3600e3);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60e3))}분 후`;
  if (h < 24) return `${h}시간 후`;
  return `${Math.floor(h / 24)}일 후`;
};
