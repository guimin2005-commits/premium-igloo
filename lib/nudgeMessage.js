/* 📌 캘린더 재촉 DM 문구
   ⚠️ bot/src/nudgeMessage.js 와 내용이 같아야 한다.
      Railway 는 bot/ 만 배포하므로 사이트 쪽 파일을 import 할 수 없어 사본을 둔다.
      한쪽을 고치면 반드시 다른 쪽도 고칠 것.

   봇은 이걸로 디스코드 임베드를 만들고, 사이트는 같은 값으로 미리보기를 그린다.
   그래서 여기서는 '문장'만 정하고 생김새는 각자 맡는다.
   운영 화면에서 고칠 수 있는 값은 비어 있으면 아래 기본값으로 돌아간다. */

export const NUDGE_COLOR = 0x00e07b;
export const NUDGE_AUTHOR = "고급 이글루 · 대회 룸";

export const DEFAULTS = {
  title: "스크림 캘린더가 아직 비어 있습니다",
  body: "팀 전원이 넣어야 겹치는 시간이 나옵니다.\n한 명이 비면 그 시간대는 잡을 수 없습니다.",
  footer: "가능한 시간만 칠하면 됩니다 · 1분이면 끝납니다",
  cta: "캘린더 열기",
};

// 길이 상한은 디스코드 임베드 제한에 맞춘다 (제목 256 · 설명 4096 · 푸터 2048 · 버튼 80)
export const LIMITS = { title: 120, body: 900, footer: 120, cta: 40 };

const pick = (v, dflt, max) => {
  const s = (v ?? "").toString().trim();
  return (s ? s : dflt).slice(0, max);
};

export const nudgeTitle = (v) => pick(v, DEFAULTS.title, LIMITS.title);
export const nudgeBody = (v) => pick(v, DEFAULTS.body, LIMITS.body);
export const nudgeFooter = (v) => pick(v, DEFAULTS.footer, LIMITS.footer);
export const nudgeCta = (v) => pick(v, DEFAULTS.cta, LIMITS.cta);

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
