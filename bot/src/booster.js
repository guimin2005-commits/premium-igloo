// 📌 서버 부스터(봇) — 부스터 혜택 아이템 보유(itemEffects.js ownedItemIds · ownedItemList) · 시즌 패스 자동 해금(views/pass.js)이 쓴다.
//    사이트 원본은 lib/booster.js(아래 공용 블록 글자 그대로) — 봇은 사이트 lib 를 import 못 해서 사본을 둔다. 공용 블록을 고치면 두 파일을 같이 고친다
//    2026-10-24 운영자 "서버 부스터 혜택 개편부터 진행하자" — 혜택 = 관리 › 아이템에서 「서버 부스터 혜택」을 켠 아이템(부스팅 중인 동안 가진 것으로 친다)

// ═══ 공용 블록 시작 — lib/booster.js 와 bot/src/booster.js 의 이 구간은 글자 하나까지 같아야 한다 ═══
// 📌 서버 부스터 판정 — 부스터 역할(DISCORD_BOOSTER_ROLE_ID)을 가졌거나, 디스코드가 직접 알려 주는 부스트 시작일(premium_since)이 있으면 부스터.
//    discord.js GuildMember(premiumSinceTimestamp · roles.cache)와 디스코드 API 날것(premium_since · roles 배열)을 다 받는다.
//    역할 ID 가 없는 곳(봇 · 배포 환경)도 부스트 시작일로 잡힌다
export function isBoosterMember(member, roleId = process.env.DISCORD_BOOSTER_ROLE_ID || "") {
  if (!member) return false;
  const hasRole = roleId
    ? member.roles?.cache
      ? member.roles.cache.has(roleId)
      : Array.isArray(member.roles) && member.roles.includes(roleId)
    : false;
  return hasRole || !!(member.premiumSinceTimestamp || member.premiumSince || member.premium_since);
}

// 📌 부스터 혜택 아이템 — 「서버 부스터 혜택」을 켠(Item.boosterPerk) 표시 중인 아이템. 부스팅 중인 동안 산 것처럼 가진 것으로 친다(효과 · 꾸미기 그대로).
//    숨긴 아이템(visible false)은 빠진다 — 혜택을 잠깐 끌 때는 숨기면 된다. 기프트카드는 효과가 없어 빠진다
export const isBoosterPerkItem = (item) => !!item && item.boosterPerk === true && item.visible !== false && item.type !== "physical";
// 📌 최초 부스팅 보상 — 2026-10-25 운영자 "150,000XP + 빙옥 30개 (단, 최초 부스팅임)" · "사람당 한 번만" · 지금 이미 부스팅 중인 사람은 지급 안 함.
//    봇(bot/src/features/boosterBonus.js)이 부스트 시작을 보면 한 사람에 한 번 준다. 혜택 화면(GET /api/booster)이 같은 숫자를 보인다
//    XP 는 지급 대기열(Payout source BOOSTER_BONUS_SOURCE — 봇이 레벨 · 역할 · 레벨업 알림까지), 빙옥은 잔액에 바로 + 원장(WalletLog kind BOOSTER_BONUS_POINT_KIND).
//    시즌 · 이벤트 패스 진행도는 채우지 않는다(사이트 lib/season.js PASS_NEUTRAL_SOURCES · 봇 grantQueue.js PASS_NEUTRAL 에 같은 글자)
export const BOOSTER_START_BONUS = { xp: 150000, point: 30 };
export const BOOSTER_BONUS_SOURCE = "booster";
export const BOOSTER_BONUS_POINT_KIND = "booster-point";
export const BOOSTER_BONUS_LABEL = "최초 부스팅 보상";
// 📌 보상 수치는 관리 › 레벨 설정 「서버 부스터 보상」(BotSetting boosterStartXp · boosterStartPoint · boosterLadder)에서 고친다 — 위 BOOSTER_START_BONUS 와 아래 사다리는 칸이 비었을 때 값.
//    2026-10-25 운영자 "개월 수 보상은?" → 연속 개월(디스코드 부스트 시작일부터) · 지금 부스터도 시작일부터 인정 · 단계마다 사람당 한 번 · "혜택은 나중에 내가 수정할테니까 추가해"
export const BOOSTER_LADDER_DEFAULT = [
  { months: 1, xp: 100000, point: 10 },
  { months: 3, xp: 200000, point: 20 },
  { months: 6, xp: 300000, point: 30 },
  { months: 9, xp: 400000, point: 40 },
  { months: 12, xp: 1000000, point: 100 },
  { months: 15, xp: 500000, point: 50 },
  { months: 18, xp: 600000, point: 60 },
  { months: 21, xp: 700000, point: 70 },
  { months: 24, xp: 2000000, point: 200 },
];
export const BOOSTER_LADDER_MAX = 12; // 단계 수 상한 — 관리 화면 · 저장 API 와 같은 값
export const BOOSTER_REWARD_MAX = 10000000; // 한 칸 XP · 빙옥 상한(봇 설정 숫자 칸과 같은 값)
export const boosterStepLabel = (months) => `연속 부스팅 ${months}개월`; // 지급 사유(Payout.reason · 원장 label)

const rewardInt = (v, d) => {
  if (v == null || v === "") return d;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(BOOSTER_REWARD_MAX, Math.max(0, n)) : d;
};
// 사다리 정리 — 개월 1~120 정수 · 같은 개월 중복 · 보상 없는 줄을 버리고 개월 순, 최대 BOOSTER_LADDER_MAX 줄(저장 API 와 봇이 같은 규칙)
export function cleanBoosterLadder(rows) {
  const seen = new Set();
  const ladder = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const months = Math.floor(Number(r?.months));
    if (!(months >= 1 && months <= 120) || seen.has(months)) continue;
    const xp = rewardInt(r?.xp, 0), point = rewardInt(r?.point, 0);
    if (xp <= 0 && point <= 0) continue;
    seen.add(months);
    ladder.push({ months, xp, point });
  }
  ladder.sort((a, b) => a.months - b.months);
  return ladder.slice(0, BOOSTER_LADDER_MAX);
}
// 설정 문서 → { start: { xp, point }, ladder: [{ months, xp, point }] }. 최초 부스팅 칸이 비면 기본값.
//    📌 연속 부스팅은 「사용」(boosterLadderOn)을 켜야만 — 꺼져 있으면 ladder 는 빈 배열(봇이 안 주고 화면에 안 보인다).
//       2026-10-25 검토: 운영자 "혜택은 나중에 내가 수정할테니까" — 기본 사다리(임시 수치)가 봇 반영 즉시 오래된 부스터에게 한꺼번에 나가면 되돌릴 수 없다.
//       사용을 켰는데 단계 칸이 없으면(저장 전) 기본 사다리
export function boosterRewardsOf(s) {
  const src = s || {};
  const start = { xp: rewardInt(src.boosterStartXp, BOOSTER_START_BONUS.xp), point: rewardInt(src.boosterStartPoint, BOOSTER_START_BONUS.point) };
  const ladder = src.boosterLadderOn === true ? cleanBoosterLadder(Array.isArray(src.boosterLadder) ? src.boosterLadder : BOOSTER_LADDER_DEFAULT) : [];
  return { start, ladder };
}

// KST 달력으로 n개월 뒤의 같은 시각 — 그 달에 같은 날이 없으면 말일(1/31 → 2/28)
const KST_MS = 9 * 60 * 60 * 1000;
export function addMonthsKst(ms, n) {
  const d = new Date(Number(ms) + KST_MS);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + Math.floor(Number(n) || 0);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()) - KST_MS;
}
// 부스트를 이어 온 개월 수 — 시작일(ms)부터 n개월 뒤 시각이 지났으면 n개월(9/1 시작이면 10/1 같은 시각부터 1개월)
export function boostMonths(sinceMs, nowMs = Date.now()) {
  const s = Number(sinceMs), now = Number(nowMs);
  if (!Number.isFinite(s) || s <= 0 || !(now >= s)) return 0;
  const a = new Date(s + KST_MS), b = new Date(now + KST_MS);
  let n = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  while (n > 0 && addMonthsKst(s, n) > now) n--;
  return Math.max(0, n);
}
// ═══ 공용 블록 끝 ═══
