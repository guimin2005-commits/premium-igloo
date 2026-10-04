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

// ── 시즌 패스 기준선 식 (순수 — DB · 별칭 import 없음) ──
//    📌 진행도 = xp − passBaseXp. 기준선 = 지금 xp − 이번 시즌에 번 XP,
//       번 XP = 세는 구간(passSince) 뒤 XpLog(amount + 패스 가속 passBoost) + 지급된 XP 대기열(amount + passBoost · 패스 보상 · 역할 환불 · 관리자 초기화 제외 — 봇이 기준선도 같이 올린다).
//    lib/seasonPass.js(한 사람 롤오버 · 시즌 시작 일괄 기록)와 점검 스크립트(scripts/rules-review-admin-pass-baseline.mjs)가 같은 식을 쓴다.
//    ⚠️ 봇 사본(bot/src/views/pass.js seasonStartBaseXp)과 같아야 한다
export const PASS_NEUTRAL_SOURCES = ["pass", "role-refund"];
// 세는 구간의 시작 — 시즌 시작과 문서가 생긴 시각(_id) 중 늦은 쪽. 퇴장 초기화로 지운 문서 시절 로그를 재입장한 새 문서에 넣지 않게
export const passSince = (s, docId) => new Date(Math.max(seasonStartMs(s), docId?.getTimestamp?.()?.getTime?.() || 0));
// 번 XP 집계 — userId 는 한 사람(글자) 또는 { $in: [...] }. byUser 면 사람마다(_id = userId)
export const passEarnedPipelines = (userId, since, byUser = false) => ({
  logs: [
    { $match: { userId, createdAt: { $gte: since } } },
    { $group: { _id: byUser ? "$userId" : null, s: { $sum: { $add: ["$amount", { $ifNull: ["$passBoost", 0] }] } } } },
  ],
  // 📌 2026-10-04 퀘스트 보상 XP 의 패스 가속 — 봇 지급 대기열이 가속분만큼 기준선을 내리고 Payout.passBoost 에 남긴다. 로그와 같이 amount + passBoost 로 센다
  //    📌 관리자 초기화 기록(kind "reset", amount −초기화 전 xp)은 뺀다 — 넣으면 번 XP 가 크게 음수가 되어 기준선이 xp 로 잡혀 진행도가 시즌 내내 0 에 묶인다.
  //       초기화는 그 자리에서 이번 시즌 기준선을 0 으로 찍으므로(app/api/xp/grant) 다시 셀 일이 없다. 퇴장 초기화 기록(amount 0)은 넣어도 같다
  //       (그렇게 찍기 전 — 2026-10-04 이전 — 에 초기화되고 기준선이 없던 문서는 초기화 전 이번 시즌 몫까지 진행도로 센다)
  pays: [
    { $match: { userId, status: "paid", currency: { $ne: "point" }, source: { $nin: PASS_NEUTRAL_SOURCES }, kind: { $ne: "reset" }, paidAt: { $gte: since } } },
    { $group: { _id: byUser ? "$userId" : null, s: { $sum: { $add: ["$amount", { $ifNull: ["$passBoost", 0] }] } } } },
  ],
});
// 가속분이 있으면 기준선이 0 아래일 수 있다 — 잘라 내면 가속으로 오른 진행도가 사라진다
export const passBaseFrom = (xp, earned) => Math.min(xp, xp - earned);
// 📌 일괄 기록용 — 기준선을 읽은 xp 가 아니라 쓰는 순간의 xp 로 계산하는 파이프라인 갱신(passBaseFrom 과 같은 식).
//    전원을 도는 동안 들어온 상점 결제 · 환불 · 봇 가속($inc passBaseXp)을 덮지 않고, 그 사이 번 XP 를 두 번 세지 않게.
//    다른 칸은 passRolloverSet 그대로($literal — 배열 · 객체를 식으로 읽지 않게). 사이트(mongoose 9)의 쿼리 갱신이면 { updatePipeline: true } 를 같이 넘긴다
export const passRolloverPipeline = (s, earned, now = new Date()) => {
  const xp = { $ifNull: ["$xp", 0] };
  const set = Object.fromEntries(Object.entries(passRolloverSet(s, 0, now)).map(([k, v]) => [k, { $literal: v }]));
  return [{ $set: { ...set, passBaseXp: { $min: [xp, { $subtract: [xp, Number(earned) || 0] }] } } }];
};
// 새 시즌으로 넘길 때 쓰는 칸 — 기준선 · 해금 · 해금 때 낸 값 · 수령 기록. ⚠️ 강화 단계(chatEnhance/voiceEnhance)는 영구 값이라 넣지 않는다
export const passRolloverSet = (s, base, now = new Date()) => ({
  passSeason: s.number,
  passBaseXp: base,
  passUnlocked: false,
  passUnlockPaid: { method: "", amount: 0 },
  passClaimedFree: [],
  passClaimedPaid: [],
  updatedAt: now,
});
// 읽은 시즌 그대로일 때만 쓰는 조건 — 칸이 없는 옛 문서는 null · 0 으로 읽힌다(동시에 들어온 요청이 두 번 찍지 않게)
export const passSeasonFilter = (seen) => (seen ? { passSeason: seen } : { passSeason: { $in: [null, 0] } });

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
