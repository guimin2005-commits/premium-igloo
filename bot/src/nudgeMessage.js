/* 📌 대회 룸이 보내는 DM 문구
   ⚠️ lib/nudgeMessage.js (사이트) 와 내용이 같아야 한다.
      Railway 는 bot/ 만 배포하므로 사이트 쪽 파일을 import 할 수 없어 사본을 둔다.
      한쪽을 고치면 반드시 다른 쪽도 고칠 것.

   봇은 이걸로 디스코드 임베드를 만들고, 사이트는 같은 값으로 미리보기를 그린다.
   그래서 여기서는 '문장'만 정하고 생김새는 각자 맡는다.
   운영 화면에서 고칠 수 있는 값은 비어 있으면 아래 기본값으로 돌아간다. */

export const NUDGE_AUTHOR = "고급 이글루 · 대회 룸";

// 길이 상한은 디스코드 임베드 제한에 맞춘다 (제목 256 · 설명 4096 · 푸터 2048 · 버튼 80)
export const LIMITS = { title: 120, body: 900, footer: 120, cta: 40 };

const pick = (v, dflt, max) => {
  const s = (v ?? "").toString().trim();
  return (s ? s : dflt).slice(0, max);
};

/* ── 캘린더 재촉 — "아직 안 냈다" ── */
export const NUDGE_COLOR = 0x00e07b;
export const DEFAULTS = {
  title: "스크림 캘린더가 아직 비어 있습니다",
  body: "팀 전원이 넣어야 겹치는 시간이 나옵니다.\n한 명이 비면 그 시간대는 잡을 수 없습니다.",
  footer: "가능한 시간만 칠하면 됩니다 · 1분이면 끝납니다",
  cta: "캘린더 열기",
};
export const nudgeTitle = (v) => pick(v, DEFAULTS.title, LIMITS.title);
export const nudgeBody = (v) => pick(v, DEFAULTS.body, LIMITS.body);
export const nudgeFooter = (v) => pick(v, DEFAULTS.footer, LIMITS.footer);
export const nudgeCta = (v) => pick(v, DEFAULTS.cta, LIMITS.cta);

/* ── 확정된 경기 알림 — "이때 경기다". 같은 큐를 타지만 하는 말이 다르다 ── */
export const FIXTURE_COLOR = 0x38bdf8;
export const FIXTURE_DEFAULTS = {
  title: "경기 일정이 잡혔습니다",
  body: "아래 시각에 경기가 있습니다.\n시간 맞춰 준비해 주세요.",
  footer: "어려우면 리더에게 미리 알려주세요",
  cta: "팀 룸 열기",
};
export const fixtureTitle = (v) => pick(v, FIXTURE_DEFAULTS.title, LIMITS.title);
export const fixtureBody = (v) => pick(v, FIXTURE_DEFAULTS.body, LIMITS.body);
export const fixtureFooter = (v) => pick(v, FIXTURE_DEFAULTS.footer, LIMITS.footer);
export const fixtureCta = (v) => pick(v, FIXTURE_DEFAULTS.cta, LIMITS.cta);

export const fmtKst = (d) =>
  new Date(d).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  });

// 마감·경기까지 남은 시간 — "3일 후" / "5시간 후" / "지남"
export const untilLabel = (d) => {
  const ms = new Date(d).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "지난 일정";
  const h = Math.floor(ms / 3600e3);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60e3))}분 후`;
  if (h < 24) return `${h}시간 후`;
  return `${Math.floor(h / 24)}일 후`;
};
