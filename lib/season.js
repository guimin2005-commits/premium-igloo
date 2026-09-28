// 📌 시즌 목록 — 홈 티커·레벨 대시보드·시즌 패스 공용. 새 시즌은 여기에 한 줄 추가한다.
//    날짜는 KST "YYYY-MM-DD" (시작일 00:00 ~ 종료일 23:59:59.999).
//    bot/src/leveling.js 의 SEASONS 와 반드시 같아야 한다 (봇은 별도 배포라 import 불가).
export const SEASONS = [
  { number: 1, name: "UP!", start: "2026-05-01", end: "2026-09-30" },
  { number: 2, name: "A new world", start: "2026-10-01", end: "2026-12-31" },
];

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const kstDate = (now = Date.now()) => new Date(Number(now) + KST_OFFSET).toISOString().slice(0, 10);
// 시작일 순 — 목록 순서가 어긋나도 판정이 흔들리지 않게
const ORDERED = [...SEASONS].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

// 지금 시즌 — 진행 중인 시즌. 없으면 마지막으로 시작한 시즌(= 가장 최근에 끝난 시즌), 첫 시즌 전이면 첫 시즌
export const currentSeason = (now = Date.now()) => {
  const today = kstDate(now);
  let cur = ORDERED[0];
  for (const s of ORDERED) if (s.start <= today) cur = s;
  return cur;
};

// 시즌 시작·끝 시각(ms)
export const seasonStartMs = (s) => Date.parse(`${s.start}T00:00:00.000+09:00`);
export const seasonEndMs = (s) => Date.parse(`${s.end}T23:59:59.999+09:00`);

// 📌 기존 사용처(SEASON.number/name/start/end)를 그대로 두려고 getter 로 둔다 — 읽을 때마다 지금 시즌을 다시 고른다.
//    9/30 까지는 시즌 1, 10/1 00:00 KST 부터 시즌 2. 스프레드·JSON 은 그 순간 값으로 굳는다.
export const SEASON = {
  get number() { return currentSeason().number; },
  get name() { return currentSeason().name; },
  get start() { return currentSeason().start; },
  get end() { return currentSeason().end; },
};

// 📌 누적 음성 참여 시간 집계 시작일 (KST) — 시즌 2 개시일.
//    이 날짜부터 봇이 시간을 쌓기 시작하며, 시즌이 바뀌어도 초기화하지 않는다.
//    XP·레벨은 시즌마다 정산되지만 이 값은 계정의 통산 기록으로 남는다.
//    bot/src/leveling.js 의 VOICE_TIME_START 와 반드시 같아야 한다.
export const VOICE_TIME_START = "2026-10-01";

// 집계가 시작됐는지 (KST 기준)
export const isVoiceTimeTracked = () => kstDate() >= VOICE_TIME_START;

// 시즌 D-Day (KST 기준) — 지금 시즌 기준. 마지막 시즌이 끝나면 ended
export const getSeasonDday = (now = Date.now()) => {
  const s = currentSeason(now);
  const days = Math.ceil((seasonEndMs(s) - now) / DAY);
  return { days, ended: kstDate(now) > s.end };
};

// 시즌 경과율 (0~100)
export const getSeasonProgress = (now = Date.now()) => {
  const s = currentSeason(now);
  const st = seasonStartMs(s);
  const e = seasonEndMs(s);
  return Math.min(100, Math.max(0, Math.round(((now - st) / (e - st)) * 100)));
};
